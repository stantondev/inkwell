defmodule Inkwell.Repo.Migrations.RenameSupporterToFirstClass do
  use Ecto.Migration

  def change do
    execute(
      "UPDATE stamps SET stamp_type = 'first_class' WHERE stamp_type = 'supporter'",
      "UPDATE stamps SET stamp_type = 'supporter' WHERE stamp_type = 'first_class'"
    )
  end
end
