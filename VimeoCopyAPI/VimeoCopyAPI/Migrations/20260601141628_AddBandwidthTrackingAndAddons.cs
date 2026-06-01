using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddBandwidthTrackingAndAddons : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BandwidthAddons",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    BandwidthMB = table.Column<long>(type: "bigint", nullable: false),
                    Price = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BandwidthAddons", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BandwidthLogs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OwnerUserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    MediaId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Bytes = table.Column<long>(type: "bigint", nullable: false),
                    ViewerIpHash = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ViewerUserId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    HourBucket = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Source = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BandwidthLogs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BandwidthAddons_Name",
                table: "BandwidthAddons",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BandwidthLogs_MediaId_HourBucket",
                table: "BandwidthLogs",
                columns: new[] { "MediaId", "HourBucket" });

            migrationBuilder.CreateIndex(
                name: "IX_BandwidthLogs_OwnerUserId_CreatedAt",
                table: "BandwidthLogs",
                columns: new[] { "OwnerUserId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BandwidthAddons");

            migrationBuilder.DropTable(
                name: "BandwidthLogs");
        }
    }
}
