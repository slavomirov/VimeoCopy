using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IDownloadRequestService
{
    /// <summary>
    /// Asks the owner for the original file. Throws when the media doesn't exist, isn't viewable,
    /// belongs to the caller, or when the owner's plan doesn't include downloads. Emails the owner
    /// on success; a mail failure does not lose the request.
    /// </summary>
    Task<DownloadRequestDTO> CreateAsync(string requesterUserId, CreateDownloadRequestDTO dto);

    /// <summary>Requests for the caller's own media — the owner's inbox.</summary>
    Task<IEnumerable<DownloadRequestDTO>> GetIncomingAsync(string ownerUserId);

    /// <summary>Requests the caller has made, with the owner's answer.</summary>
    Task<IEnumerable<DownloadRequestDTO>> GetOutgoingAsync(string requesterUserId);

    /// <summary>Badge counts for the sidebar.</summary>
    Task<DownloadRequestSummaryDTO> GetSummaryAsync(string userId);

    /// <summary>
    /// Owner's answer. `approve` false both denies a pending request and revokes one that was
    /// already granted, because an owner changing their mind is the whole point of asking.
    /// </summary>
    Task<DownloadRequestDTO> DecideAsync(long requestId, string ownerUserId, bool approve);

    /// <summary>
    /// Removes a request for good. Either side may do it — the owner clearing their inbox, or the
    /// requester withdrawing an ask (and, on an approved row, giving up the access it granted).
    ///
    /// The one thing it must not do is launder a refusal: a requester deleting their own declined
    /// row would reset the cooling-off period and hand the "ask again" button straight back, so
    /// that case is refused while the period still stands. The owner has no such limit — the
    /// protection is theirs, and theirs to drop.
    /// </summary>
    Task DeleteAsync(long requestId, string userId);
}
