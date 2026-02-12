using System.Text.Json;

namespace VimeoCopyAPI.Middlewares;

public class CsrfProtectionMiddleware
{
    private static readonly HashSet<string> ProtectedMethods =
    [
        HttpMethods.Post,
        HttpMethods.Put,
        HttpMethods.Patch,
        HttpMethods.Delete
    ];

    private readonly RequestDelegate _next;
    private readonly HashSet<string> _allowedOrigins;

    public CsrfProtectionMiddleware(RequestDelegate next, IEnumerable<string> allowedOrigins)
    {
        _next = next;
        _allowedOrigins = allowedOrigins
            .Where(o => !string.IsNullOrWhiteSpace(o))
            .Select(NormalizeOrigin)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public async Task Invoke(HttpContext context)
    {
        if (!ShouldValidateRequest(context.Request))
        {
            await _next(context);
            return;
        }

        if (IsAllowedByOriginHeader(context.Request) || IsAllowedByRefererHeader(context.Request))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";

        var response = JsonSerializer.Serialize(new
        {
            message = "Blocked by CSRF protection. Invalid request origin."
        });

        await context.Response.WriteAsync(response);
    }

    private bool ShouldValidateRequest(HttpRequest request)
    {
        if (!ProtectedMethods.Contains(request.Method))
            return false;

        if (!request.Path.StartsWithSegments("/api"))
            return false;

        var hasRefreshCookie = request.Cookies.ContainsKey("refreshToken");
        if (!hasRefreshCookie)
            return false;

        return request.Path.StartsWithSegments("/api/auth")
            || request.Path.StartsWithSegments("/api/payments");
    }

    private bool IsAllowedByOriginHeader(HttpRequest request)
    {
        var originHeader = request.Headers.Origin.ToString();
        if (string.IsNullOrWhiteSpace(originHeader))
            return false;

        var normalized = NormalizeOrigin(originHeader);
        return _allowedOrigins.Contains(normalized);
    }

    private bool IsAllowedByRefererHeader(HttpRequest request)
    {
        var refererHeader = request.Headers.Referer.ToString();
        if (string.IsNullOrWhiteSpace(refererHeader))
            return false;

        if (!Uri.TryCreate(refererHeader, UriKind.Absolute, out var refererUri))
            return false;

        var refererOrigin = $"{refererUri.Scheme}://{refererUri.Authority}";
        var normalized = NormalizeOrigin(refererOrigin);
        return _allowedOrigins.Contains(normalized);
    }

    private static string NormalizeOrigin(string origin)
        => origin.Trim().TrimEnd('/');
}
