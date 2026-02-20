defmodule Inkwell.Repo do
  use Ecto.Repo,
    otp_app: :inkwell,
    adapter: Ecto.Adapters.Postgres
end
