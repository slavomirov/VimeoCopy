using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VimeoCopyAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddMediaIsProfileAsset : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsProfileAsset",
                table: "Media",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsProfileAsset",
                table: "Media");
        }
    }
}
