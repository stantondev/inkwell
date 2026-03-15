defmodule Inkwell.Workers.ImportDataWorker do
  @moduledoc """
  Background worker that processes uploaded import files, parses entries,
  and creates them as drafts or published entries in batches.
  """

  use Oban.Worker, queue: :default, max_attempts: 2

  alias Inkwell.Import
  alias Inkwell.Import.DataImport
  alias Inkwell.Import.ImageImporter
  alias Inkwell.Journals
  alias Inkwell.Repo

  @max_entries 5000
  @batch_size 50

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"import_id" => import_id, "user_id" => user_id}}) do
    import_record = Repo.get!(DataImport, import_id)

    if import_record.status != "pending" do
      :ok
    else
      {:ok, import_record} = Import.mark_processing(import_record)

      try do
        process_import(import_record, user_id)
      rescue
        e ->
          Import.mark_failed(import_record, Exception.message(e))
          {:error, Exception.message(e)}
      end
    end
  end

  defp process_import(import_record, user_id) do
    parser = get_parser(import_record.format)

    # Unpack multi-file container if present
    file_data = maybe_unpack_multifile(import_record.file_data, import_record.file_name)

    case parser.parse(file_data) do
      {:error, reason} ->
        Import.mark_failed(import_record, "Parse error: #{reason}")
        :ok

      {:ok, entries} ->
        entries = Enum.take(entries, @max_entries)
        total = length(entries)

        {:ok, import_record} =
          Import.update_progress(import_record, %{total_entries: total})

        {imported, skipped, errored, errors} =
          entries
          |> Enum.with_index(1)
          |> Enum.chunk_every(@batch_size)
          |> Enum.reduce({0, 0, 0, []}, fn batch, {imp, skip, err, errs} ->
            # Check if cancelled between batches
            refreshed = Repo.get!(DataImport, import_record.id)

            if refreshed.status == "cancelled" do
              throw(:cancelled)
            end

            {batch_imp, batch_skip, batch_err, batch_errs} =
              process_batch(batch, user_id, import_record)

            new_imp = imp + batch_imp
            new_skip = skip + batch_skip
            new_err = err + batch_err

            Import.update_progress(import_record, %{
              imported_count: new_imp,
              skipped_count: new_skip,
              error_count: new_err
            })

            {new_imp, new_skip, new_err, errs ++ batch_errs}
          end)

        Import.mark_completed(import_record, %{
          imported_count: imported,
          skipped_count: skipped,
          error_count: errored,
          errors: Enum.take(errors, 100)
        })

        :ok
    end
  catch
    :cancelled -> :ok
  end

  defp process_batch(batch, user_id, import_record) do
    Enum.reduce(batch, {0, 0, 0, []}, fn {entry_map, index}, {imp, skip, err, errs} ->
      case create_imported_entry(entry_map, user_id, import_record) do
        {:ok, _entry} ->
          {imp + 1, skip, err, errs}

        {:skipped, reason} ->
          error = %{"index" => index, "title" => entry_map[:title] || "(untitled)", "reason" => reason}
          {imp, skip + 1, err, errs ++ [error]}

        {:error, reason} ->
          error = %{"index" => index, "title" => entry_map[:title] || "(untitled)", "reason" => reason}
          {imp, skip, err + 1, errs ++ [error]}
      end
    end)
  end

  defp create_imported_entry(entry_map, user_id, import_record) do
    if duplicate?(entry_map, user_id) do
      {:skipped, "Duplicate entry (same title and date)"}
    else
      attrs = build_entry_attrs(entry_map, user_id, import_record)
      should_be_draft = import_record.import_mode == "draft" || entry_map[:was_draft] == true

      if should_be_draft do
        case Journals.create_draft(attrs) do
          {:ok, entry} -> {:ok, entry}
          {:error, changeset} -> {:error, format_changeset_error(changeset)}
        end
      else
        # For published imports, need body_html
        body = attrs["body_html"] || ""

        if String.trim(body) == "" do
          # Fall back to draft if no body
          case Journals.create_draft(attrs) do
            {:ok, entry} -> {:ok, entry}
            {:error, changeset} -> {:error, format_changeset_error(changeset)}
          end
        else
          case Journals.create_entry_quiet(attrs) do
            {:ok, entry} -> {:ok, entry}
            {:error, changeset} -> {:error, format_changeset_error(changeset)}
          end
        end
      end
    end
  end

  defp build_entry_attrs(entry_map, user_id, import_record) do
    # Localize external images in body HTML
    body_html = ImageImporter.localize_images(entry_map[:body_html], user_id)

    %{
      "title" => entry_map[:title],
      "body_html" => body_html,
      "mood" => entry_map[:mood],
      "music" => entry_map[:music],
      "tags" => entry_map[:tags] || [],
      "privacy" => import_record.default_privacy,
      "user_id" => user_id,
      "published_at" => entry_map[:published_at]
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()
    |> Map.put("user_id", user_id)
  end

  defp duplicate?(entry_map, user_id) do
    title = entry_map[:title]
    published_at = entry_map[:published_at]

    if is_nil(title) || is_nil(published_at) do
      false
    else
      window_start = DateTime.add(published_at, -60, :second)
      window_end = DateTime.add(published_at, 60, :second)

      import Ecto.Query

      Inkwell.Journals.Entry
      |> where(user_id: ^user_id)
      |> where([e], e.title == ^title)
      |> where([e], e.published_at >= ^window_start and e.published_at <= ^window_end)
      |> Repo.exists?()
    end
  end

  defp get_parser("inkwell_json"), do: Inkwell.Import.Parsers.InkwellJson
  defp get_parser("generic_csv"), do: Inkwell.Import.Parsers.GenericCsv
  defp get_parser("generic_json"), do: Inkwell.Import.Parsers.GenericJson
  defp get_parser("wordpress_wxr"), do: Inkwell.Import.Parsers.WordpressWxr
  defp get_parser("medium_html"), do: Inkwell.Import.Parsers.MediumHtml
  defp get_parser("substack_csv"), do: Inkwell.Import.Parsers.SubstackCsv
  defp get_parser("substack"), do: Inkwell.Import.Parsers.Substack
  defp get_parser("auto"), do: Inkwell.Import.Parsers.AutoDetect

  # When multiple files are uploaded, the frontend packs them into a JSON container.
  # Unpack into a ZIP so parsers can handle them normally.
  defp maybe_unpack_multifile(data, "_multifile.json") do
    case Jason.decode(data) do
      {:ok, %{"_multifile" => true, "files" => files}} when is_list(files) ->
        zip_entries =
          files
          |> Enum.filter(fn f -> is_map(f) && is_binary(f["name"]) && is_binary(f["content"]) end)
          |> Enum.map(fn %{"name" => name, "content" => content} ->
            {to_charlist(name), content}
          end)

        case :zip.create(~c"multi.zip", zip_entries, [:memory]) do
          {:ok, {_, zip_data}} -> zip_data
          _ -> data
        end

      _ ->
        data
    end
  rescue
    _ -> data
  end

  defp maybe_unpack_multifile(data, _filename), do: data

  defp format_changeset_error(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
    |> Enum.map(fn {field, messages} -> "#{field}: #{Enum.join(messages, ", ")}" end)
    |> Enum.join("; ")
  end
end
