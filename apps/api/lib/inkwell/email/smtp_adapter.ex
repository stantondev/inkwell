defmodule Inkwell.Email.SmtpAdapter do
  @moduledoc """
  SMTP email delivery using gen_smtp_client.
  Used when SMTP_HOST is configured (self-hosted instances).
  """
  require Logger

  @doc "Send a single email via SMTP."
  def send_email(to, subject, html_body, opts \\ []) do
    config = smtp_config()
    from_email = opts[:from] || Application.get_env(:inkwell, :from_email, "Inkwell <noreply@localhost>")
    {_from_name, from_addr} = parse_address(from_email)

    mail_body = build_mime_message(from_email, to, subject, html_body, opts)

    smtp_options =
      [
        relay: String.to_charlist(config[:host]),
        port: config[:port] || 587,
        username: maybe_charlist(config[:username]),
        password: maybe_charlist(config[:password]),
        tls: :if_available,
        ssl: config[:ssl] || false,
        auth: if(config[:auth] != false, do: :if_available, else: :never),
        hostname: String.to_charlist(hostname())
      ]
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)

    case :gen_smtp_client.send_blocking(
           {String.to_charlist(from_addr), [String.to_charlist(to)], mail_body},
           smtp_options
         ) do
      receipt when is_binary(receipt) ->
        {:ok, :sent}

      {:error, type, reason} ->
        Logger.error("[SMTP] Send error (#{inspect(type)}): #{inspect(reason)}")
        {:error, :send_failed}

      {:error, reason} ->
        Logger.error("[SMTP] Send error: #{inspect(reason)}")
        {:error, :send_failed}
    end
  end

  @doc """
  Send a batch of emails sequentially via SMTP.
  Each email is a map with :from/:to/:subject/:html and optionally :headers.
  """
  def send_batch(emails) when is_list(emails) do
    results =
      Enum.map(emails, fn email ->
        to = get_first_recipient(email)
        subject = email[:subject] || email["subject"] || "(no subject)"
        html = email[:html] || email["html"] || ""
        from = email[:from] || email["from"]
        headers = email[:headers] || email["headers"] || %{}
        reply_to = email[:reply_to] || email["reply_to"]

        send_email(to, subject, html,
          from: from,
          extra_headers: headers,
          reply_to: reply_to
        )
      end)

    sent = Enum.count(results, &match?({:ok, _}, &1))
    failed = length(results) - sent

    if failed == 0 do
      {:ok, sent}
    else
      {:error, sent, failed}
    end
  end

  # ── Private helpers ──

  defp build_mime_message(from, to, subject, html_body, opts) do
    boundary = "inkwell-#{:crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)}"
    extra_headers = opts[:extra_headers] || %{}
    reply_to = opts[:reply_to]

    headers =
      [
        "From: #{from}",
        "To: #{to}",
        "Subject: #{encode_subject(subject)}",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"#{boundary}\""
      ]

    headers = if reply_to, do: headers ++ ["Reply-To: #{reply_to}"], else: headers

    headers =
      headers ++
        Enum.map(extra_headers, fn
          {k, v} when is_binary(k) and is_binary(v) -> "#{k}: #{v}"
          _ -> nil
        end)
        |> Enum.reject(&is_nil/1)

    plain_text = strip_html(html_body)

    body = """
    --#{boundary}\r
    Content-Type: text/plain; charset="utf-8"\r
    Content-Transfer-Encoding: 8bit\r
    \r
    #{plain_text}\r
    --#{boundary}\r
    Content-Type: text/html; charset="utf-8"\r
    Content-Transfer-Encoding: 8bit\r
    \r
    #{html_body}\r
    --#{boundary}--\r
    """

    Enum.join(headers, "\r\n") <> "\r\n\r\n" <> body
  end

  defp strip_html(html) do
    html
    |> String.replace(~r/<br\s*\/?>/, "\n")
    |> String.replace(~r/<\/p>/, "\n\n")
    |> String.replace(~r/<[^>]*>/, "")
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&middot;", "\u00B7")
    |> String.replace("&rsquo;", "\u2019")
    |> String.replace("&ldquo;", "\u201C")
    |> String.replace("&rdquo;", "\u201D")
    |> String.replace("&mdash;", "\u2014")
    |> String.replace("&nbsp;", " ")
    |> String.trim()
  end

  defp encode_subject(subject) do
    if String.match?(subject, ~r/[^\x20-\x7E]/) do
      "=?UTF-8?B?#{Base.encode64(subject)}?="
    else
      subject
    end
  end

  defp parse_address(address) do
    case Regex.run(~r/^(.+?)\s*<(.+?)>$/, address) do
      [_, name, email] -> {String.trim(name), email}
      _ -> {address, address}
    end
  end

  defp get_first_recipient(email) do
    to = email[:to] || email["to"]

    case to do
      [first | _] -> first
      single when is_binary(single) -> single
      _ -> ""
    end
  end

  defp maybe_charlist(nil), do: nil
  defp maybe_charlist(""), do: nil
  defp maybe_charlist(str) when is_binary(str), do: String.to_charlist(str)

  defp hostname do
    System.get_env("HOSTNAME") || System.get_env("PHX_HOST") || "localhost"
  end

  defp smtp_config do
    Application.get_env(:inkwell, :smtp, [])
  end
end
