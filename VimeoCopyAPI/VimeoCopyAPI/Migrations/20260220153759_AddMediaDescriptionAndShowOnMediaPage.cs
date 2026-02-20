using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddMediaDescriptionAndShowOnMediaPage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Media",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FileName",
                table: "Media",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowOnMediaPage",
                table: "Media",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "Media");

            migrationBuilder.DropColumn(
                name: "FileName",
                table: "Media");

            migrationBuilder.DropColumn(
                name: "ShowOnMediaPage",
                table: "Media");
        }
    }
}
