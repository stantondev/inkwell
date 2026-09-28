defmodule Inkwell.Instance do
  @moduledoc """
  Where this Inkwell runs, what it's called and who to contact.

  Everything that needs this instance's own address or name asks here
  instead of writing "inkwell.social", so a self-hosted instance
  (`INKWELL_SELF_HOSTED=true`) is itself everywhere: fediverse ids, emails,
  "is this URL ours?" checks. On inkwell.social every answer is what the
  code hardcoded before.
  """

  # Hosts inkwell.social's content has ever had ids on. Entry ids were stored
  # on inkwell.social, older ones on the Fly hostnames. Only inkwell.social
  # (and dev/test, which run on copies of its data) treat these as ours: a
  # self-hosted instance that did would drop letters and replies from real
  # inkwell.social members as if it had written them itself.
  @inkwell_social_hosts ~w(inkwell.social www.inkwell.social api.inkwell.social inkwell-api.fly.dev inkwell-web.fly.dev)

  @doc "The public address of the site, e.g. https://inkwell.social (no trailing slash)."
  def frontend_url do
    (Application.get_env(:inkwell, :frontend_url) || "https://inkwell.social")
    |> String.trim_trailing("/")
  end

  @doc "The site's host name, e.g. inkwell.social."
  def frontend_host, do: URI.parse(frontend_url()).host

  @doc "The host fediverse ids and handles live on (`INSTANCE_HOST`)."
  def instance_host do
    Application.get_env(:inkwell, :federation, [])
    |> Keyword.get(:instance_host, "inkwell.social")
  end

  @doc "The name shown for this instance (`INSTANCE_NAME`), \"Inkwell\" by default."
  def name do
    case Application.get_env(:inkwell, :instance_name) do
      name when is_binary(name) and name != "" -> name
      _ -> "Inkwell"
    end
  end

  @doc "Where member questions, support requests and appeals go (`CONTACT_EMAIL`)."
  def contact_email, do: Application.get_env(:inkwell, :feedback_email) || "hello@inkwell.social"

  @doc "The bare address outgoing mail is sent from, taken from `FROM_EMAIL`."
  def from_address do
    from = Application.get_env(:inkwell, :from_email) || "Inkwell <noreply@inkwell.social>"

    case Regex.run(~r/<([^>]+)>/, from) do
      [_, address] -> String.trim(address)
      _ -> String.trim(from)
    end
  end

  @doc "True on inkwell.social itself (and in dev/test): not a self-hosted copy."
  def inkwell_social?, do: not Inkwell.SelfHosted.enabled?()

  @doc "Every host name that means this instance."
  def local_hosts do
    legacy = if inkwell_social?(), do: @inkwell_social_hosts, else: []

    [
      "https://#{instance_host()}",
      frontend_url(),
      Application.get_env(:inkwell, :api_url),
      InkwellWeb.Endpoint.url(),
      Application.get_env(:inkwell, :federation, []) |> Keyword.get(:frontend_host)
    ]
    |> Enum.filter(&is_binary/1)
    |> Enum.map(&URI.parse(&1).host)
    |> Enum.reject(&is_nil/1)
    |> Kernel.++(legacy)
    |> Enum.map(&String.downcase/1)
    |> Enum.uniq()
  end

  @doc "Whether a host name means this instance."
  def local_host?(host) when is_binary(host), do: String.downcase(host) in local_hosts()
  def local_host?(_), do: false

  @doc "Whether a URL is on one of this instance's hosts. A URL without a host counts as ours."
  def local_url?(url) when is_binary(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) -> local_host?(host)
      _ -> true
    end
  end

  def local_url?(_), do: false
end
