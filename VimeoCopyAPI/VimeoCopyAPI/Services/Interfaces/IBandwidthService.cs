using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IBandwidthService
{
    /// <summary>
    /// Records a presign-time view against the media owner's bandwidth quota.
    /// Hour-bucketed by (mediaId, viewerKey) so refreshes within the hour don't double-count.
    /// Owner viewing own media is never counted.
    /// Returns true if streaming may proceed; false if owner is out of bandwidth.
    /// </summary>
    Task<bool> TrackPresignAsync(Media media, BandwidthSource source);
}
