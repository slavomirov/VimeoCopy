using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <summary>
    /// Retires the showreel and puts pinned media in its place.
    ///
    /// The showreel was a curated bundle a visitor could ask to download in one go; pinning is
    /// presentation only — a handful of pieces the artist wants seen first on their public page.
    /// They share nothing but the column they replace, so this is a removal and an addition rather
    /// than a rename.
    /// </summary>
    /// <inheritdoc />
    public partial class ReplaceShowreelWithPinnedMedia : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // FIRST, and the order matters twice over. Showreel requests are the only rows with a
            // null MediaId, so they have to be gone before the column can be made NOT NULL — and
            // they have to be identified while Kind still exists to identify them by. With the
            // feature withdrawn there is nothing for these grants to unlock anyway.
            migrationBuilder.Sql("DELETE FROM [DownloadRequests] WHERE [Kind] = 'Showreel';");

            migrationBuilder.DropIndex(
                name: "IX_DownloadRequests_OwnerUserId_RequesterUserId_Kind_Status",
                table: "DownloadRequests");

            migrationBuilder.DropColumn(
                name: "InShowreel",
                table: "Media");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "DownloadRequests");

            migrationBuilder.AddColumn<DateTime>(
                name: "PinnedAt",
                table: "Media",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "MediaId",
                table: "DownloadRequests",
                type: "uniqueidentifier",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Structural only. The deleted showreel requests do not come back, and neither does
            // anyone's showreel membership — down-migrating restores the shape, not the data.
            migrationBuilder.DropColumn(
                name: "PinnedAt",
                table: "Media");

            migrationBuilder.AddColumn<bool>(
                name: "InShowreel",
                table: "Media",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<Guid>(
                name: "MediaId",
                table: "DownloadRequests",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "DownloadRequests",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Media");

            migrationBuilder.CreateIndex(
                name: "IX_DownloadRequests_OwnerUserId_RequesterUserId_Kind_Status",
                table: "DownloadRequests",
                columns: new[] { "OwnerUserId", "RequesterUserId", "Kind", "Status" });
        }
    }
}
