using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class AuditFixes_PendingUploads_StripeIdempotency_LinkRevocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SharedLinks_MediaId",
                table: "SharedLinks");

            migrationBuilder.AddColumn<DateTime>(
                name: "RevokedAt",
                table: "SharedLinks",
                type: "datetime2",
                nullable: true);

            // Refresh tokens are now stored as SHA-256 digests instead of plaintext. Existing rows
            // hold raw 88-character tokens: narrowing the column would silently truncate them, and
            // the new unique index could then collide. They can't be converted (a hash is one-way)
            // and they're exactly what this change exists to stop storing, so drop them. Everyone
            // is signed out once and logs back in; access tokens keep working until they expire.
            migrationBuilder.Sql("DELETE FROM [RefreshTokens];");

            migrationBuilder.AlterColumn<string>(
                name: "Token",
                table: "RefreshTokens",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AddColumn<long>(
                name: "ThumbnailSize",
                table: "Media",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PendingUploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsProfileAsset = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PendingUploads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PendingUploads_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProcessedStripeEvents",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ProcessedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProcessedStripeEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SharedLinks_MediaId_RevokedAt",
                table: "SharedLinks",
                columns: new[] { "MediaId", "RevokedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_Token",
                table: "RefreshTokens",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PendingUploads_ExpiresAt",
                table: "PendingUploads",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_PendingUploads_UserId",
                table: "PendingUploads",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PendingUploads");

            migrationBuilder.DropTable(
                name: "ProcessedStripeEvents");

            migrationBuilder.DropIndex(
                name: "IX_SharedLinks_MediaId_RevokedAt",
                table: "SharedLinks");

            migrationBuilder.DropIndex(
                name: "IX_RefreshTokens_Token",
                table: "RefreshTokens");

            migrationBuilder.DropColumn(
                name: "RevokedAt",
                table: "SharedLinks");

            migrationBuilder.DropColumn(
                name: "ThumbnailSize",
                table: "Media");

            migrationBuilder.AlterColumn<string>(
                name: "Token",
                table: "RefreshTokens",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(64)",
                oldMaxLength: 64);

            migrationBuilder.CreateIndex(
                name: "IX_SharedLinks_MediaId",
                table: "SharedLinks",
                column: "MediaId");
        }
    }
}
