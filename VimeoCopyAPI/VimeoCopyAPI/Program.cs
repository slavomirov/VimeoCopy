using Amazon;
using Amazon.S3;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;

var builder = WebApplication.CreateBuilder(args);


builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// AWS config
var awsConfig = builder.Configuration.GetSection("AWS");
builder.Services.AddSingleton<IAmazonS3>(sp => { return new AmazonS3Client(awsConfig["AccessKey"], awsConfig["SecretKey"], RegionEndpoint.GetBySystemName(awsConfig["Region"])); });

//DB Config
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

//FE CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:5173") // FE dev server
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});


var app = builder.Build();

//Automatic migrations
//remove on production
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); 
    db.Database.Migrate();
}

app.UseCors("AllowFrontend");


// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
