defmodule Inkwell.FraudDetection do
  @moduledoc """
  Lightweight fraud detection helpers.
  Currently: disposable/temporary email domain detection, used to refuse new
  signups (existing accounts can still sign in).

  The list is `priv/moderation/disposable_email_domains.txt` (the community
  disposable-email-domains list, ~9,000 domains) plus a few providers seen
  here. The spam scorer (`Moderation.SpamSignals`) deliberately keeps its own
  short list: on 2026-10-11 the big list matched a real writer's provider
  (mailna.co, 55 entries), and scoring existing accounts against it could
  have suspended them.
  """

  @list_path Path.join([__DIR__, "..", "..", "priv", "moderation", "disposable_email_domains.txt"])
  @external_resource @list_path

  @extra_domains ~w(
    10minutemail.com guerrillamail.com guerrillamail.net mailexpire.com
    minutemail.com tempr.email tmail.ws tmpmail.net tmpmail.org
  )

  @disposable_domains @list_path
                      |> File.read!()
                      |> String.split("\n")
                      |> Enum.map(&String.trim/1)
                      |> Enum.reject(&(&1 == "" or String.starts_with?(&1, "#")))
                      |> Enum.concat(@extra_domains ++ Inkwell.Moderation.SpamSignals.disposable_domains())
                      |> Enum.map(&String.downcase/1)
                      |> MapSet.new()

  @doc """
  Returns true if the email address uses a known disposable/temporary email
  domain, including subdomains of one (`x@mail.yopmail.com`).
  """
  def disposable_email?(email) when is_binary(email) do
    case String.split(email, "@") do
      [_, domain] -> disposable_domain?(domain)
      _ -> false
    end
  end

  def disposable_email?(_), do: false

  @doc false
  def disposable_domain?(domain) when is_binary(domain) do
    domain
    |> String.downcase()
    |> String.trim_trailing(".")
    |> parent_domains()
    |> Enum.any?(&MapSet.member?(@disposable_domains, &1))
  end

  def disposable_domain?(_), do: false

  # "a.b.example.com" → ["a.b.example.com", "b.example.com", "example.com"]
  defp parent_domains(domain) do
    parts = String.split(domain, ".")

    for i <- 0..max(length(parts) - 2, 0), do: parts |> Enum.drop(i) |> Enum.join(".")
  end
end
