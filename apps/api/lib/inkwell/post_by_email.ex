defmodule Inkwell.PostByEmail do
  @moduledoc """
  Processes inbound emails from Postmark into journal entries.
  """

  import Ecto.Query, only: [where: 3]

  alias Inkwell.Accounts
  alias Inkwell.Journals
  require Logger

  @max_emails_per_day 20

  @doc """
  Process an inbound email from Postmark's webhook JSON payload.
  Returns {:ok, entry} or {:error, reason}.
  """
  def process_inbound_email(payload) when is_map(payload) do
    with {:ok, token} <- extract_token(payload),
         {:ok, user} <- lookup_user(token),
         :ok <- verify_plus(user),
         :ok <- check_spam(payload),
         :ok <- check_rate_limit(user) do
      create_entry_from_email(user, payload)
    end
  end

  # Extract the token from the recipient address: post+TOKEN@post.inkwell.social
  defp extract_token(payload) do
    to = payload["To"] || payload["to"] || ""

    # Handle multiple recipients — find the post+ one
    addresses = String.split(to, ",") |> Enum.map(&String.trim/1)

    token =
      Enum.find_value(addresses, fn addr ->
        case Regex.run(~r/post\+([^@]+)@/i, addr) do
          [_, token] -> token
          _ -> nil
        end
      end)

    if token, do: {:ok, token}, else: {:error, :invalid_recipient}
  end

  defp lookup_user(token) do
    case Accounts.get_user_by_post_email_token(token) do
      nil -> {:error, :user_not_found}
      user -> {:ok, user}
    end
  end

  defp verify_plus(user) do
    if (user.subscription_tier || "free") == "plus" do
      :ok
    else
      {:error, :not_plus}
    end
  end

  defp check_spam(payload) do
    headers = payload["Headers"] || []

    spam_score =
      Enum.find_value(headers, 0.0, fn
        %{"Name" => "X-Spam-Score", "Value" => score} ->
          case Float.parse(score) do
            {val, _} -> val
            :error -> 0.0
          end
        _ -> false
      end)

    if spam_score > 5.0 do
      Logger.warning("[PostByEmail] Rejected email with spam score #{spam_score}")
      {:error, :spam}
    else
      :ok
    end
  end

  defp check_rate_limit(user) do
    today = Date.utc_today()
    start_of_day = DateTime.new!(today, ~T[00:00:00], "Etc/UTC")

    count =
      Inkwell.Repo.aggregate(
        Inkwell.Journals.Entry
        |> where([e], e.user_id == ^user.id)
        |> where([e], e.source == "email")
        |> where([e], e.inserted_at >= ^start_of_day),
        :count,
        :id
      )

    if count >= @max_emails_per_day do
      {:error, :rate_limited}
    else
      :ok
    end
  end

  defp create_entry_from_email(user, payload) do
    subject = payload["Subject"] || ""
    html_body = payload["HtmlBody"] || ""
    text_body = payload["TextBody"] || ""

    title = if subject != "", do: String.slice(subject, 0, 500), else: fallback_title()

    body_html =
      cond do
        html_body != "" ->
          html_body
          |> sanitize_email_html()
          |> strip_email_signatures()

        text_body != "" ->
          text_body
          |> strip_email_signatures()
          |> text_to_html()

        true ->
          "<p>(empty email)</p>"
      end

    # Process attachments — first image becomes cover, rest inline
    {cover_image_id, body_html} = process_attachments(user, payload, body_html)

    # Calculate word count
    plain_text = String.replace(body_html, ~r/<[^>]*>/, " ") |> String.replace(~r/\s+/, " ") |> String.trim()
    word_count = plain_text |> String.split(~r/\s+/) |> length()

    # Generate excerpt
    excerpt = String.slice(plain_text, 0, 280)

    attrs = %{
      title: title,
      body_html: body_html,
      privacy: :public,
      user_id: user.id,
      source: "email",
      word_count: word_count,
      excerpt: excerpt,
      tags: []
    }

    attrs = if cover_image_id, do: Map.put(attrs, :cover_image_id, cover_image_id), else: attrs

    case Journals.create_entry(attrs) do
      {:ok, entry} ->
        Logger.info("[PostByEmail] Created entry #{entry.id} for user #{user.username}")
        {:ok, entry}

      {:error, changeset} ->
        Logger.error("[PostByEmail] Failed to create entry: #{inspect(changeset.errors)}")
        {:error, :create_failed}
    end
  end

  defp fallback_title do
    "Email Post — #{Calendar.strftime(DateTime.utc_now(), "%B %d, %Y")}"
  end

  defp sanitize_email_html(html) do
    html
    # Strip script tags
    |> String.replace(~r/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/is, "")
    # Strip style tags (email clients add lots of inline styles, keep those but remove <style> blocks)
    |> String.replace(~r/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/is, "")
    # Strip event handlers
    |> String.replace(~r/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
    # Strip javascript: URLs
    |> String.replace(~r/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/i, "\\1=\"\"")
    # Strip iframes
    |> String.replace(~r/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/is, "")
    |> String.replace(~r/<iframe\b[^>]*\/?\s*>/is, "")
  end

  defp strip_email_signatures(text) do
    # Strip common signature separators
    text
    |> String.split(~r/\n-- ?\n/m)
    |> List.first()
    |> then(fn t ->
      # Strip "On ... wrote:" quoted blocks
      t |> String.split(~r/\nOn .+ wrote:\n/m) |> List.first()
    end)
    |> then(fn t ->
      # Strip "Sent from my iPhone/iPad/etc."
      String.replace(t, ~r/\n?Sent from my [\w\s]+\s*$/im, "")
    end)
    |> String.trim()
  end

  defp text_to_html(text) do
    text
    |> String.split(~r/\n{2,}/)
    |> Enum.map(fn para ->
      escaped = para |> String.trim() |> Phoenix.HTML.html_escape() |> Phoenix.HTML.safe_to_string()
      "<p>#{escaped}</p>"
    end)
    |> Enum.join("\n")
  end

  defp process_attachments(user, payload, body_html) do
    attachments = payload["Attachments"] || []

    image_attachments =
      Enum.filter(attachments, fn att ->
        content_type = att["ContentType"] || ""
        String.starts_with?(content_type, "image/")
      end)

    if image_attachments == [] do
      {nil, body_html}
    else
      # First image is the cover
      [first | rest] = image_attachments

      cover_id = upload_attachment_image(user, first)

      # Additional images get appended to body
      body_with_images =
        Enum.reduce(rest, body_html, fn att, html ->
          case upload_attachment_image(user, att) do
            nil -> html
            image_id -> html <> "\n<p><img src=\"/api/images/#{image_id}\" alt=\"#{att["Name"] || "image"}\" /></p>"
          end
        end)

      {cover_id, body_with_images}
    end
  end

  defp upload_attachment_image(user, attachment) do
    content = attachment["Content"] || ""
    content_type = attachment["ContentType"] || "image/jpeg"
    filename = attachment["Name"] || "email-image.jpg"

    if content == "" do
      nil
    else
      data_uri = "data:#{content_type};base64,#{content}"
      byte_size = byte_size(content)

      case Inkwell.Repo.insert(%Inkwell.Journals.EntryImage{
        user_id: user.id,
        data: data_uri,
        content_type: content_type,
        filename: filename,
        byte_size: byte_size
      }) do
        {:ok, image} -> image.id
        {:error, _} -> nil
      end
    end
  end
end
