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

    /// <summary>
    /// Asks an artist for their whole showreel. Same guards as a single file — plan, cooling-off,
    /// daily cap — plus one of its own: an artist who has curated nothing has nothing to grant.
    /// </summary>
    Task<DownloadRequestDTO> CreateShowreelAsync(string requesterUserId, CreateShowreelRequestDTO dto);

    /// <summary>Whether this viewer holds a live showreel grant from this owner.</summary>
    Task<bool> HasApprovedShowreelAsync(string ownerUserId, string viewerUserId);

    /// <summary>
    /// Resolves a handle to the owner whose showreel this viewer may download, and the name to
    /// save it under. Throws unless the viewer is the owner or holds an approved request — this is
    /// the authorisation for the zip endpoint, kept next to the grant it reads rather than in the
    /// controller, so nothing can stream a bundle without passing through it.
    /// </summary>
    Task<(string OwnerUserId, string FileName)> ResolveShowreelOwnerAsync(string handle, string viewerUserId);

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
}
