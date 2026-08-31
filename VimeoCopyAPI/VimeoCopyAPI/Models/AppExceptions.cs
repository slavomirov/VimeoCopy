namespace VimeoCopyAPI.Models;

/// <summary>
/// Business-rule failures the caller can act on. These map to real 4xx status codes in
/// ErrorHandlingMiddleware — unlike a bare Exception, which is treated as a server fault and
/// answered with a generic 500 so internal detail never reaches the client.
/// </summary>
public abstract class AppException : Exception
{
    protected AppException(string message) : base(message) { }
}

/// <summary>The request was understood but the data is not acceptable. → 400</summary>
public class ValidationException : AppException
{
    public ValidationException(string message) : base(message) { }
}

/// <summary>The resource doesn't exist, or the caller isn't allowed to know that it does. → 404</summary>
public class NotFoundException : AppException
{
    public NotFoundException(string message) : base(message) { }
}

/// <summary>The caller is authenticated but not permitted. → 403</summary>
public class ForbiddenException : AppException
{
    public ForbiddenException(string message) : base(message) { }
}

/// <summary>A quota or plan limit blocks the action. → 402</summary>
public class QuotaExceededException : AppException
{
    public QuotaExceededException(string message) : base(message) { }
}
