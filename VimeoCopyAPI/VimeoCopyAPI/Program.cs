using Amazon;
using Amazon.S3;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
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
    options.SignIn.RequireConfirmedEmail = false; // �� �� �������� ��-�����
    options.Password.RequiredUniqueChars = 0;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequiredLength = 5;
})
.AddEntityFrameworkStores<AppDbContext>()
.AddDefaultTokenProviders();


builder.Services.AddHostedService<RefreshTokenCleanupService>();
builder.Services.AddHostedService<PlanExpirationService>();

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

var key = builder.Configuration["Jwt:Key"];
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
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key))
    };
});

//Services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IMediaService, MediaService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUploadService, UploadService>();


builder.Services.AddOptions<StripeOptions>().Bind(builder.Configuration.GetSection("Stripe"));

var app = builder.Build();



//Automatic migrations
//remove on production
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
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

app.UseCors("AllowFrontend");

app.UseMiddleware<CsrfProtectionMiddleware>(new object[] { allowedFrontendOrigins });

app.UseMiddleware<ErrorHandlingMiddleware>();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();


app.MapControllers();

app.Run();
