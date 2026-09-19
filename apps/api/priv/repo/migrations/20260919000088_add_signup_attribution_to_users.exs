defmodule Inkwell.Repo.Migrations.AddSignupAttributionToUsers do
  use Ecto.Migration

  # Where each account came from, so we can tell which outreach works.
  # Captured once, at signup, from a first-party cookie set on the visitor's
  # first page view (external referring site, ?ref= tag, landing page), plus
  # an optional "How did you find Inkwell?" answer from onboarding.
  def change do
    alter table(:users) do
      add :signup_referrer_host, :string
      add :signup_ref, :string
      add :signup_landing_path, :string
      add :heard_from, :string
      add :heard_from_detail, :string
    end
  end
end
