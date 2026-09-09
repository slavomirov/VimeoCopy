using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

/// <summary>
/// Appeals against takedowns: the owner's route back for a file staff made private.
///
/// The rule this exists to enforce is that <see cref="Models.Media.StaffHidden"/> is not the
/// owner's to clear. Everything here is either the owner making a case or staff answering it, and
/// nothing else in the codebase turns that flag off for a file staff hid.
/// </summary>
public interface IRepublishService
{
    /// <summary>
    /// Files an appeal. Throws unless the caller owns the media and it was actually taken down by
    /// staff — an owner's own private file needs no appeal, they can just publish it. One live
    /// appeal per file.
    /// </summary>
    Task<RepublishRequestDTO> CreateAsync(string ownerUserId, CreateRepublishRequestDTO dto);

    /// <summary>The staff inbox: appeals waiting for an answer, oldest first.</summary>
    Task<IEnumerable<RepublishRequestDTO>> GetPendingAsync();

    /// <summary>This owner's own appeals, so the dashboard can say where one got to.</summary>
    Task<IEnumerable<RepublishRequestDTO>> GetMineAsync(string ownerUserId);

    /// <summary>
    /// Staff's answer. Approving republishes the file and clears the staff-hidden flag; refusing
    /// leaves it down. Either way the owner is emailed, and the decision is written to the audit
    /// log — putting content back is as much an administrative act as taking it down.
    /// </summary>
    Task<RepublishRequestDTO> DecideAsync(long requestId, string adminUserId, DecideRepublishRequestDTO dto);

    /// <summary>Count for the admin overview's "waiting on you" line.</summary>
    Task<int> CountPendingAsync();
}
