using System.Net;
using System.Text.Json;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Middlewares;

public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _logger;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        // Messages on these types are written for the caller, so they're safe to return verbatim.
        catch (ValidationException ex)
        {
            await WriteError(context, HttpStatusCode.BadRequest, ex.Message);
        }
        catch (NotFoundException ex)
        {
            await WriteError(context, HttpStatusCode.NotFound, ex.Message);
        }
        catch (ForbiddenException ex)
        {
            await WriteError(context, HttpStatusCode.Forbidden, ex.Message);
        }
        catch (QuotaExceededException ex)
        {
            await WriteError(context, HttpStatusCode.PaymentRequired, ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            await WriteError(context, HttpStatusCode.Unauthorized, ex.Message);
        }
        catch (Exception ex)
        {
            // Anything else is a fault we didn't anticipate. Log the detail; tell the caller nothing
            // — an unplanned exception message can carry connection strings, paths or SQL.
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path);

            await WriteError(context, HttpStatusCode.InternalServerError,
                "Something went wrong on our end. Please try again.");
        }
    }

    private static async Task WriteError(HttpContext context, HttpStatusCode status, string message)
    {
        // A response that already started streaming can't be rewritten — overwriting the status here
        // would throw a second exception on top of the first.
        if (context.Response.HasStarted) return;

        context.Response.Clear();
        context.Response.StatusCode = (int)status;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new { message }));
    }
}
