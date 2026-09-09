using Amazon;
using Amazon.S3;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using System.Text;
using System.Threading.RateLimiting;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Addons;
using VimeoCopyAPI.Middlewares;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services;
using VimeoCopyAPI.Services.Interfaces;

var builder = WebApplication.CreateBuilder(args);


builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Behind a proxy or CDN every request arrives from the same address unless the forwarded headers
// are honoured. Without this the rate limiter partitions the entire world into one bucket, and
// anonymous view de-duplication collapses every viewer into a single hashed key.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;

    // Only trust proxies we name. Accepting X-Forwarded-For from anywhere would let any caller
    // spoof their address and walk straight around the limiter.
    options.KnownProxies.Clear();
    options.KnownNetworks.Clear();

    foreach (var proxy in builder.Configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
    {
        if (System.Net.IPAddress.TryParse(proxy, out var ip))
            options.KnownProxies.Add(ip);
    }
});

// Rate limiting — throttle abuse-prone endpoints (registration floods, credential stuffing) and
// keep a global floor under everything else.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Partition per user when we know who they are, so one noisy account can't spend the budget
    // of everyone sharing its address (offices, mobile carriers, NAT).
    static string ClientKey(HttpContext ctx)
        => ctx.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
           ?? ctx.Connection.RemoteIpAddress?.ToString()
           ?? "unknown";

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(httpContext),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 240, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    options.AddPolicy("auth", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(httpContext),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    // Minting presigned URLs is the denial-of-wallet surface: each one is storage we pay for, or
    // egress charged to a creator's plan.
    options.AddPolicy("presign", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(httpContext),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    // The contact form is anonymous and sends mail on our Resend account, so it is the cheapest
    // thing on the site to abuse and the most expensive to have abused — a sender's reputation is
    // hard to win back. Three a minute is plenty for a human writing in.
    options.AddPolicy("contact", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(httpContext),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    // A download request emails a creator, so the abuse shape is the contact form's: cheap to
    // send, expensive to be on the receiving end of. The service also caps the day's total.
    options.AddPolicy("download-request", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(httpContext),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// AWS S3 storage config
var awsConfig = builder.Configuration.GetSection("AWS");
builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    return new AmazonS3Client
    (
        awsConfig["AccessKey"],
        awsConfig["SecretKey"],
        new AmazonS3Config { ServiceURL = awsConfig["ServiceURL"], ForcePathStyle = true }
    );
});

//DB Config
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
{
    options.SignIn.RequireConfirmedEmail = false; // TODO: enable before launch (needs an email-verify flow)
    options.Password.RequiredUniqueChars = 1;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireDigit = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireUppercase = false;
    options.Password.RequiredLength = 8;
    // Lock the account after repeated failed logins to stop brute-force / credential stuffing.
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.Lockout.AllowedForNewUsers = true;
})
.AddEntityFrameworkStores<AppDbContext>()
.AddDefaultTokenProviders();


builder.Services.AddHostedService<RefreshTokenCleanupService>();
builder.Services.AddHostedService<PlanExpirationService>();
builder.Services.AddHostedService<StorageBandwidthMaintenanceService>();

var allowedFrontendOrigins = builder.Configuration.GetSection("Frontend:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];

//FE CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedFrontendOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Fail at startup, not at the first sign-in attempt. A missing key used to surface as a bare
// NullReferenceException, and a too-short one only broke when someone tried to log in.
var key = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(key))
    throw new InvalidOperationException("Jwt:Key is not configured. Set it before starting the API.");
if (Encoding.UTF8.GetByteCount(key) < 32)
    throw new InvalidOperationException("Jwt:Key must be at least 32 bytes for HMAC-SHA256.");
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddGoogle(options =>
{
    options.ClientId = builder.Configuration["Authentication:Google:ClientId"]!;
    options.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"]!;
}).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
        // Default skew is 5 minutes, which quietly stretches a 15-minute token to 20.
        ClockSkew = TimeSpan.FromSeconds(30)
    };
});

//Services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IMediaService, MediaService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUploadService, UploadService>();
builder.Services.AddScoped<IPlanService, PlanService>();
builder.Services.AddScoped<ISharedLinkService, SharedLinkService>();
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddScoped<IBandwidthService, BandwidthService>();
builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<IAnalyticsService, AnalyticsService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<IDownloadRequestService, DownloadRequestService>();
builder.Services.AddScoped<IAdminService, AdminService>();


builder.Services.AddOptions<StripeOptions>().Bind(builder.Configuration.GetSection("Stripe"));

var app = builder.Build();

// Development convenience only. In production, schema changes are applied as an explicit deploy
// step — migrating on boot lets any starting instance rewrite the schema, and several instances
// can race the same migration.
if (app.Environment.IsDevelopment())
{
    using var migrationScope = app.Services.CreateScope();
    var db = migrationScope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

using (var scope = app.Services.CreateScope())
{
    var planService = scope.ServiceProvider.GetRequiredService<IPlanService>();
    await planService.EnsurePlanExists();
}


using (var scope = app.Services.CreateScope())
{
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();

    string[] roles = { "Admin", "Moderator", "User" };

    foreach (var role in roles)
    {
        if (!await roleManager.RoleExistsAsync(role))
        {
            await roleManager.CreateAsync(new IdentityRole(role));
        }
    }
}


// The first administrator. Roles exist above, but nothing has ever been IN one, so a fresh
// database has an admin page that literally nobody can open — and no way in through the UI,
// because granting the Admin role is itself an admin action.
//
// Configuration rather than a hardcoded address, and the password is read from configuration too
// so it can come from user-secrets or the environment instead of a file in the repository. An
// account that already exists is only promoted; its password is never touched.
using (var scope = app.Services.CreateScope())
{
    var adminEmail = app.Configuration["Admin:Email"];
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

    if (string.IsNullOrWhiteSpace(adminEmail))
    {
        // appsettings.json is gitignored, so a value set on one machine is absent on the next one.
        // Said out loud rather than passed over: an admin page nobody can open looks like a broken
        // page, and the fix is one config key that gives no hint it is missing.
        if ((await userManager.GetUsersInRoleAsync("Admin")).Count == 0)
        {
            app.Logger.LogWarning(
                "No account holds the Admin role and Admin:Email is not configured, so /admin is " +
                "unreachable. Set Admin:Email (and Admin:Password for an account that does not " +
                "exist yet) in appsettings.json, user-secrets, or the environment.");
        }
    }
    else
    {
        var existing = await userManager.FindByEmailAsync(adminEmail);

        if (existing is null)
        {
            var adminPassword = app.Configuration["Admin:Password"];
            if (string.IsNullOrWhiteSpace(adminPassword))
            {
                app.Logger.LogWarning(
                    "Admin:Email is set to {Email} but no such account exists and Admin:Password is empty — " +
                    "nothing was created. Register the account normally, or set Admin:Password.", adminEmail);
            }
            else
            {
                existing = new ApplicationUser
                {
                    UserName = adminEmail,
                    Email = adminEmail,
                    EmailConfirmed = true,
                    CreatedAt = DateTime.UtcNow,
                };

                var created = await userManager.CreateAsync(existing, adminPassword);
                if (!created.Succeeded)
                {
                    app.Logger.LogError("Could not create the administrator account: {Errors}",
                        string.Join(" ", created.Errors.Select(e => e.Description)));
                    existing = null;
                }
                else
                {
                    // Same free plan and handle every other new account gets — an admin is still a
                    // user of the product, and an account with no plan behaves oddly everywhere else.
                    var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
                    await userService.AssignPlanToUserAsync(existing.Id, "Free");
                    await userService.BackfillMissingHandlesAsync();
                }
            }
        }

        if (existing is not null && !await userManager.IsInRoleAsync(existing, "Admin"))
        {
            await userManager.AddToRoleAsync(existing, "Admin");
            app.Logger.LogInformation("Granted the Admin role to {Email}.", adminEmail);
        }
    }
}

// Accounts created before handles were automatic have none, and a handle is the only address a
// public profile has — without this they would stay unreachable. Idempotent: nothing to do once
// every account has one.
using (var scope = app.Services.CreateScope())
{
    var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
    var filled = await userService.BackfillMissingHandlesAsync();
    if (filled > 0)
        app.Logger.LogInformation("Assigned a default handle to {Count} existing account(s).", filled);
}

// Must run before anything that reads the client's address — the rate limiter and the bandwidth
// de-duplication both do.
app.UseForwardedHeaders();

// Enforce HTTPS + HSTS outside development (dev may run plain http).
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

// CORS must wrap the rate limiter: a limiter rejection short-circuits the pipeline, and if CORS
// hasn't run yet that 429 carries no Access-Control-Allow-Origin. The browser then blocks the
// response outright and the caller's fetch() rejects with an opaque network error instead of
// seeing the 429 — which is how a throttled /api/auth/logout turned into a dead Logout button.
app.UseCors("AllowFrontend");

app.UseRateLimiter();

app.UseMiddleware<CsrfProtectionMiddleware>(new object[] { allowedFrontendOrigins });

app.UseMiddleware<ErrorHandlingMiddleware>();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}



//app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();


app.MapControllers();

app.Run();
