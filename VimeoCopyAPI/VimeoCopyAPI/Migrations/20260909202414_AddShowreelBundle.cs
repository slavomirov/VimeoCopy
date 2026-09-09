using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddShowreelBundle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
                // "Media", not the generated "": every row that already exists predates showreels
                // and is a single-file request. An empty Kind would fail the == "Media" test the
                // download endpoint makes, silently revoking every approval ever granted.
                defaultValue: "Media");

            migrationBuilder.CreateIndex(
                name: "IX_DownloadRequests_OwnerUserId_RequesterUserId_Kind_Status",
                table: "DownloadRequests",
                columns: new[] { "OwnerUserId", "RequesterUserId", "Kind", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DownloadRequests_OwnerUserId_RequesterUserId_Kind_Status",
                table: "DownloadRequests");

            migrationBuilder.DropColumn(
                name: "InShowreel",
                table: "Media");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "DownloadRequests");

            migrationBuilder.AlterColumn<Guid>(
                name: "MediaId",
                table: "DownloadRequests",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
