defmodule Inkwell.CustomDomains.CustomDomain do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @statuses ~w(pending_dns pending_cert active error removed)

  schema "custom_domains" do
    belongs_to :user, Inkwell.Accounts.User

    field :domain, :string
    field :status, :string, default: "pending_dns"
    field :dns_verified_at, :utc_datetime_usec
    field :cert_issued_at, :utc_datetime_usec
    field :last_check_at, :utc_datetime_usec
    field :error_message, :string
    field :fly_cert_id, :string

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(custom_domain, attrs) do
    custom_domain
    |> cast(attrs, [:domain, :user_id, :status, :dns_verified_at, :cert_issued_at,
                    :last_check_at, :error_message, :fly_cert_id])
    |> validate_required([:domain, :user_id])
    |> validate_inclusion(:status, @statuses)
    |> validate_domain_format()
    |> unique_constraint(:domain, message: "is already in use by another Inkwell user")
    |> unique_constraint(:user_id, message: "you can only have one custom domain")
  end

  defp validate_domain_format(changeset) do
    validate_change(changeset, :domain, fn :domain, domain ->
      cond do
        not Regex.match?(~r/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/i, domain) ->
          [domain: "must be a valid domain name (e.g., blog.example.com)"]

        String.ends_with?(String.downcase(domain), ".fly.dev") ->
          [domain: "cannot use a .fly.dev domain"]

        String.ends_with?(String.downcase(domain), ".inkwell.social") ->
          [domain: "cannot use an inkwell.social subdomain"]

        String.downcase(domain) == "inkwell.social" ->
          [domain: "cannot use inkwell.social"]

        String.length(domain) > 253 ->
          [domain: "is too long (maximum 253 characters)"]

        true ->
          []
      end
    end)
  end
end
