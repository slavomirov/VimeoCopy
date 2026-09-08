using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace VimeoCopyAPI.Services;

/// <summary>
/// The one definition of what a handle may be.
///
/// Shared by the profile editor's validation and by the default handle generated at sign-up, so a
/// generated handle can never be one the editor would refuse to save.
/// </summary>
public static partial class HandleRules
{
    public const int MinLength = 3;
    public const int MaxLength = 30;

    /// <summary>Wording for every rejection, so the rule is stated in exactly one place.</summary>
    public const string ValidationMessage =
        "Handle must be 3–30 characters using only lowercase letters, numbers, '-' or '_'.";

    /// <summary>Seed used when an email address yields nothing handle-shaped at all.</summary>
    private const string FallbackSeed = "artist";

    /// <summary>
    /// Handles that collide with a literal segment under /api/profiles. A user holding one of these
    /// would have their public profile shadowed by the same-named route: GET /api/profiles/me wins
    /// over GET /api/profiles/{handle}, so /u/me would serve the *viewer's* own profile instead.
    /// </summary>
    public static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "me", "search",
    };

    public static bool IsValid(string handle) => HandleRegex().IsMatch(handle);

    public static bool IsReserved(string handle) => Reserved.Contains(handle);

    /// <summary>
    /// A handle-shaped seed from the local part of an email address: "jane.doe@example.com" →
    /// "jane-doe". Uniqueness is not considered here — callers append a suffix until the database
    /// accepts one — but the result is always valid and never reserved.
    /// </summary>
    public static string SeedFromEmail(string? email)
    {
        var local = (email ?? string.Empty).Split('@')[0].ToLowerInvariant();

        // Anything outside the handle alphabet ('.', '+', accents...) becomes a single separator,
        // so "jane..doe" and "jane.doe" both land on "jane-doe" rather than "jane--doe".
        var sb = new StringBuilder(MaxLength);
        foreach (var ch in local)
        {
            if (ch is >= 'a' and <= 'z' || ch is >= '0' and <= '9' || ch is '_' or '-')
                sb.Append(ch);
            else if (sb.Length > 0 && sb[^1] != '-')
                sb.Append('-');

            if (sb.Length == MaxLength) break;
        }

        var seed = sb.ToString().Trim('-', '_');

        // Too short to be a handle, or a name the router owns. Both are short strings, so suffixing
        // them keeps the result inside MaxLength and keeps it readable: "me" → "me-artist".
        if (seed.Length < MinLength)
            seed = seed.Length == 0 ? FallbackSeed : $"{seed}-{FallbackSeed}";
        else if (IsReserved(seed))
            seed = $"{seed}-{FallbackSeed}";

        return seed;
    }

    /// <summary>
    /// "jane-doe" + "2" → "jane-doe-2", trimming the seed so the result still fits MaxLength.
    /// </summary>
    public static string WithSuffix(string seed, string suffix)
    {
        var room = MaxLength - suffix.Length - 1;
        var trimmed = (seed.Length > room ? seed[..room] : seed).TrimEnd('-', '_');
        return $"{trimmed}-{suffix}";
    }

    /// <summary>Last-resort suffix for a seed whose readable variants are all taken.</summary>
    public static string RandomSuffix() => RandomNumberGenerator
        .GetString("abcdefghijklmnopqrstuvwxyz0123456789", 4);

    /// <summary>
    /// Handles to try for a new account, best first: the bare seed, then readable numbered forms,
    /// then random suffixes. Finite on purpose — a caller that exhausts it leaves the account
    /// without a handle rather than looping forever.
    /// </summary>
    public static IEnumerable<string> CandidatesFor(string seed)
    {
        yield return seed;

        for (var n = 2; n <= 20; n++)
            yield return WithSuffix(seed, n.ToString());

        for (var i = 0; i < 5; i++)
            yield return WithSuffix(seed, RandomSuffix());
    }

    [GeneratedRegex("^[a-z0-9_-]{3,30}$")]
    private static partial Regex HandleRegex();
}
