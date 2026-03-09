defmodule Inkwell.Translations do
  @moduledoc """
  Context for on-demand content translation via DeepL with PostgreSQL caching.
  Each piece of content is translated once per target language and cached forever.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Translations.ContentTranslation
  alias Inkwell.DeepL

  @allowed_types ~w(entry comment remote_entry guestbook_entry circle_response)

  def allowed_types, do: @allowed_types

  @doc """
  Translate content by type and ID to the given target language.
  Returns cached translation if available, otherwise calls DeepL API.
  """
  def translate(type, id, target_lang) when type in @allowed_types do
    # Normalize target language (DeepL uses uppercase)
    target_lang = String.upcase(target_lang)

    case get_cached(type, id, target_lang) do
      %ContentTranslation{} = cached ->
        {:ok, format_result(cached, true)}

      nil ->
        with {:ok, content} <- fetch_source_content(type, id),
             {:ok, results} <- translate_content(content, target_lang) do
          # Store in cache
          source_lang = get_in(results, [:source_language])

          attrs = %{
            translatable_type: type,
            translatable_id: id,
            source_language: source_lang,
            target_language: target_lang,
            translated_title: results[:translated_title],
            translated_body: results[:translated_body],
            provider: "deepl"
          }

          case %ContentTranslation{}
               |> ContentTranslation.changeset(attrs)
               |> Repo.insert(
                 on_conflict: {:replace, [:translated_title, :translated_body, :source_language, :updated_at]},
                 conflict_target: [:translatable_type, :translatable_id, :target_language]
               ) do
            {:ok, translation} ->
              {:ok, format_result(translation, false)}

            {:error, changeset} ->
              {:error, {:save_failed, changeset}}
          end
        end
    end
  end

  def translate(_type, _id, _target_lang), do: {:error, :invalid_type}

  @doc "Get a cached translation."
  def get_cached(type, id, target_lang) do
    Repo.one(
      from(t in ContentTranslation,
        where:
          t.translatable_type == ^type and
            t.translatable_id == ^id and
            t.target_language == ^target_lang
      )
    )
  end

  @doc "Delete all cached translations for a piece of content (used on edit/delete)."
  def delete_translations_for(type, id) do
    from(t in ContentTranslation,
      where: t.translatable_type == ^type and t.translatable_id == ^id
    )
    |> Repo.delete_all()
  end

  # Fetch the source content (title + body) for the given type and ID
  defp fetch_source_content("entry", id) do
    case Inkwell.Journals.get_entry(id) do
      nil -> {:error, :not_found}
      entry -> {:ok, %{title: entry.title, body: entry.body_html, has_html: true}}
    end
  end

  defp fetch_source_content("comment", id) do
    case Repo.get(Inkwell.Journals.Comment, id) do
      nil -> {:error, :not_found}
      comment -> {:ok, %{title: nil, body: comment.body_html, has_html: true}}
    end
  end

  defp fetch_source_content("remote_entry", id) do
    case Inkwell.Federation.RemoteEntries.get_remote_entry(id) do
      nil -> {:error, :not_found}
      entry -> {:ok, %{title: entry.title, body: entry.body_html, has_html: true}}
    end
  end

  defp fetch_source_content("guestbook_entry", id) do
    case Repo.get(Inkwell.Guestbook.GuestbookEntry, id) do
      nil -> {:error, :not_found}
      entry -> {:ok, %{title: nil, body: entry.body, has_html: false}}
    end
  end

  defp fetch_source_content("circle_response", id) do
    case Repo.get(Inkwell.Circles.CircleResponse, id) do
      nil -> {:error, :not_found}
      response -> {:ok, %{title: nil, body: response.body, has_html: false}}
    end
  end

  # Call DeepL API with the content
  defp translate_content(%{title: title, body: body, has_html: has_html}, target_lang) do
    # Build list of texts to translate (batch call for efficiency)
    {texts, has_title} =
      case title do
        nil -> {[body], false}
        "" -> {[body], false}
        t -> {[t, body], true}
      end

    # Use HTML tag handling for HTML content so formatting is preserved
    opts = if has_html, do: [tag_handling: "html"], else: []

    case DeepL.translate(texts, target_lang, opts) do
      {:ok, results} ->
        source_lang =
          results
          |> List.first()
          |> Map.get(:detected_source_language)

        if has_title do
          [title_result, body_result] = results

          {:ok,
           %{
             translated_title: title_result.text,
             translated_body: body_result.text,
             source_language: source_lang
           }}
        else
          [body_result] = results

          {:ok,
           %{
             translated_title: nil,
             translated_body: body_result.text,
             source_language: source_lang
           }}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp format_result(%ContentTranslation{} = t, cached) do
    %{
      translated_title: t.translated_title,
      translated_body: t.translated_body,
      source_language: t.source_language,
      target_language: t.target_language,
      cached: cached
    }
  end
end
