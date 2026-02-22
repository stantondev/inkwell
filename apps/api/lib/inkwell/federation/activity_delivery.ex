defmodule Inkwell.Federation.ActivityDelivery do
  @moduledoc """
  Delivers ActivityPub activities to remote inboxes via HTTP POST
  with HTTP Signature authentication.
  """

  alias Inkwell.Federation.HttpSignature

  require Logger

  @doc """
  Delivers an activity JSON to a remote inbox, signed with the user's private key.
  Returns :ok on success or {:error, reason} on failure.
  """
  def deliver(activity, inbox_url, private_key_pem, key_id) do
    body = Jason.encode!(activity)

    Logger.info("Delivering activity to #{inbox_url}")

    headers = HttpSignature.sign("post", inbox_url, body, private_key_pem, key_id)

    # Convert headers to charlist format for :httpc
    httpc_headers = Enum.map(headers, fn {k, v} ->
      {String.to_charlist(k), String.to_charlist(v)}
    end)

    content_type = ~c"application/activity+json"

    case :httpc.request(
      :post,
      {String.to_charlist(inbox_url), httpc_headers, content_type, String.to_charlist(body)},
      [{:timeout, 15_000}, {:connect_timeout, 10_000}],
      []
    ) do
      {:ok, {{_, status, _}, _headers, _body}} when status in 200..299 ->
        Logger.info("Successfully delivered to #{inbox_url} (#{status})")
        :ok

      {:ok, {{_, status, _}, _headers, resp_body}} ->
        Logger.warning("Delivery to #{inbox_url} failed: HTTP #{status} — #{to_string(resp_body) |> String.slice(0..200)}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("Delivery to #{inbox_url} failed: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
