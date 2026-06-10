using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class RemoveBandwidthAddons : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BandwidthAddons");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BandwidthAddons",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BandwidthMB = table.Column<long>(type: "bigint", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Price = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BandwidthAddons", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BandwidthAddons_Name",
                table: "BandwidthAddons",
                column: "Name",
                unique: true);
        }
    }
}
