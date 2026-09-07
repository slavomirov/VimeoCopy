using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models.DTOs;

/// <summary>
/// A message written on the public contact form. Every field is untrusted: the endpoint is
/// anonymous, so the limits here are what stops it being used to post essays through our mail
/// provider, and the recipient is never part of this payload.
/// </summary>
public class ContactMessageDTO
{
    [Required(ErrorMessage = "Please tell us your name.")]
    [MaxLength(100)]
    public string Name { get; set; } = default!;

    [Required(ErrorMessage = "Please give us an email address so we can reply.")]
    [EmailAddress(ErrorMessage = "That doesn't look like an email address.")]
    [MaxLength(200)]
    public string Email { get; set; } = default!;

    [Required(ErrorMessage = "Please add a subject.")]
    [MaxLength(150)]
    public string Subject { get; set; } = default!;

    [Required(ErrorMessage = "Please write a message.")]
    [MinLength(10, ErrorMessage = "Please add a little more detail.")]
    [MaxLength(4000)]
    public string Message { get; set; } = default!;
}

/// <summary>Owner's choice of whether one file may be downloaded.</summary>
public class SetDownloadableDTO
{
    public bool Downloadable { get; set; }
}
