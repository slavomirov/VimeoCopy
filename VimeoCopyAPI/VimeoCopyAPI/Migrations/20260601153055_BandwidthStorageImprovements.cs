using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class BandwidthStorageImprovements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "BandwithMB",
                table: "Plans",
                newName: "BandwidthMB");

            migrationBuilder.AddColumn<DateTime>(
                name: "BandwidthCycleStart",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "BandwidthOverageNotifiedAt",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);

            // Storage & bandwidth were previously stored in MB; the app now tracks raw bytes.
            // Convert existing rows (1 MB = 1024 * 1024 bytes). NULLs are left untouched.
            migrationBuilder.Sql(@"
                UPDATE [AspNetUsers]
                SET [BuyedMemory]    = [BuyedMemory]    * 1048576,
                    [UsedMemory]     = [UsedMemory]     * 1048576,
                    [BuyedBandwidth] = [BuyedBandwidth] * 1048576,
                    [UsedBandwidth]  = [UsedBandwidth]  * 1048576;");

            // Start a bandwidth cycle for users who already hold a plan.
            migrationBuilder.Sql(@"
                UPDATE [AspNetUsers]
                SET [BandwidthCycleStart] = SYSUTCDATETIME()
                WHERE [BuyedBandwidth] IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revert bytes back to MB.
            migrationBuilder.Sql(@"
                UPDATE [AspNetUsers]
                SET [BuyedMemory]    = [BuyedMemory]    / 1048576,
                    [UsedMemory]     = [UsedMemory]     / 1048576,
                    [BuyedBandwidth] = [BuyedBandwidth] / 1048576,
                    [UsedBandwidth]  = [UsedBandwidth]  / 1048576;");

            migrationBuilder.DropColumn(
                name: "BandwidthCycleStart",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BandwidthOverageNotifiedAt",
                table: "AspNetUsers");

            migrationBuilder.RenameColumn(
                name: "BandwidthMB",
                table: "Plans",
                newName: "BandwithMB");
        }
    }
}
