using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddMediaGalleryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Media_UserId",
                table: "Media");

            migrationBuilder.CreateIndex(
                name: "IX_Media_Gallery",
                table: "Media",
                columns: new[] { "IsPublic", "ShowOnMediaPage", "IsProfileAsset", "UploadedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Media_Owner_UploadedAt",
                table: "Media",
                columns: new[] { "UserId", "UploadedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Media_Gallery",
                table: "Media");

            migrationBuilder.DropIndex(
                name: "IX_Media_Owner_UploadedAt",
                table: "Media");

            migrationBuilder.CreateIndex(
                name: "IX_Media_UserId",
                table: "Media",
                column: "UserId");
        }
    }
}
