using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class SyncMemories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "StorageLimitInBytes",
                table: "Plans",
                newName: "StorageLimitMB");

            migrationBuilder.AddColumn<long>(
                name: "BandwithMB",
                table: "Plans",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "BuyedBandwidth",
                table: "AspNetUsers",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "UsedBandwidth",
                table: "AspNetUsers",
                type: "bigint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BandwithMB",
                table: "Plans");

            migrationBuilder.DropColumn(
                name: "BuyedBandwidth",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "UsedBandwidth",
                table: "AspNetUsers");

            migrationBuilder.RenameColumn(
                name: "StorageLimitMB",
                table: "Plans",
                newName: "StorageLimitInBytes");
        }
    }
}
