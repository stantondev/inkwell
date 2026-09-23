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
  def perform(%Oban.Job{args: %{"import_id" => import_id, "user_id" => user_id}, attempt: attempt}) do
    import_record = Repo.get!(DataImport, import_id)

    # A retry of a job that was interrupted (e.g. the API restarted during a
    # deploy) finds the import still "processing"; carry on rather than leave
    # it stuck. Entries already created are skipped as duplicates.
    resumable? = import_record.status == "processing" and attempt > 1

    if import_record.status != "pending" and not resumable? do
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

        comments = Process.get(:imported_comments, 0)

        Import.mark_completed(import_record, %{
          imported_count: imported,
          skipped_count: skipped,
          error_count: errored,
          errors: Enum.take(errors, 100),
          options: Map.put(import_record.options || %{}, "comments_imported", comments)
        })

        :ok
    end
  catch
    :cancelled -> :ok
  end

  defp process_batch(batch, user_id, import_record) do
    Enum.reduce(batch, {0, 0, 0, []}, fn {entry_map, index}, {imp, skip, err, errs} ->
      case safely_create(entry_map, user_id, import_record) do
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

  # One entry the database refuses mustn't fail the whole import.
  defp safely_create(entry_map, user_id, import_record) do
    create_imported_entry(entry_map, user_id, import_record)
  rescue
    e -> {:error, "Couldn't save this entry: " <> String.slice(Exception.message(e), 0, 200)}
  end

  defp create_imported_entry(entry_map, user_id, import_record) do
    if existing = duplicate(entry_map, user_id) do
      # Re-running an import brings in comments the first run didn't have
      # (e.g. imports from before comments were supported), once.
      if entry_map[:comments] not in [nil, []] and not has_comments?(existing), do: import_comments(existing, entry_map[:comments], import_record)
      # …and records where it came from, for posts imported before we kept that.
      if is_nil(existing.imported_from), do: put_origin(existing, entry_map, import_record)
      {:skipped, "Duplicate entry (same title and date)"}
    else
      attrs = build_entry_attrs(entry_map, user_id, import_record)
      should_be_draft = import_record.import_mode == "draft" || entry_map[:was_draft] == true

      if should_be_draft do
        case Journals.create_draft(attrs) do
          {:ok, entry} -> {:ok, with_comments(entry, entry_map, import_record)}
          {:error, changeset} -> {:error, format_changeset_error(changeset)}
        end
      else
        # For published imports, need body_html
        body = attrs["body_html"] || ""

        if String.trim(body) == "" do
          # Fall back to draft if no body
          case Journals.create_draft(attrs) do
            {:ok, entry} -> {:ok, with_comments(entry, entry_map, import_record)}
            {:error, changeset} -> {:error, format_changeset_error(changeset)}
          end
        else
          case Journals.create_entry_quiet(attrs) do
            {:ok, entry} -> {:ok, with_comments(entry, entry_map, import_record)}
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
      # These columns hold 255 characters; a longer value used to fail the
      # whole import (a Substack CSV in February 2026).
      "title" => fit(entry_map[:title], 255),
      "body_html" => body_html,
      "mood" => fit(entry_map[:mood], 255),
      "music" => fit(entry_map[:music], 255),
      "tags" => entry_map[:tags] || [],
      "privacy" => stricter_privacy(entry_map[:privacy], import_record.default_privacy),
      "user_id" => user_id,
      "published_at" => entry_map[:published_at],
      "source" => "import"
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()
    |> Map.put("user_id", user_id)
  end

  # An entry's own privacy (e.g. a LiveJournal friends-only post) wins when
  # it's stricter than the default the writer picked for the import; an
  # import never makes anything more public than it was.
  @privacy_rank %{"public" => 0, "friends_only" => 1, "custom" => 2, "private" => 3}

  defp stricter_privacy(nil, default), do: default

  defp stricter_privacy(own, default) do
    if Map.get(@privacy_rank, own, 3) > Map.get(@privacy_rank, default, 3), do: own, else: default
  end

  defp fit(nil, _max), do: nil
  defp fit(text, max) when is_binary(text), do: String.slice(text, 0, max)
  defp fit(other, _max), do: other

  defp duplicate(entry_map, user_id) do
    title = fit(entry_map[:title], 255)
    published_at = entry_map[:published_at]

    if is_nil(published_at) do
      nil
    else
      window_start = DateTime.add(published_at, -60, :second)
      window_end = DateTime.add(published_at, 60, :second)

      import Ecto.Query

      query =
        Inkwell.Journals.Entry
        |> where(user_id: ^user_id)
        |> where([e], e.published_at >= ^window_start and e.published_at <= ^window_end)

      # Untitled posts (common on LiveJournal) match on date alone, so
      # re-running an import doesn't double them up.
      query = if is_nil(title), do: where(query, [e], is_nil(e.title)), else: where(query, [e], e.title == ^title)

      query |> limit(1) |> Repo.one()
    end
  end

  # ── Imported comments (LiveJournal / Dreamwidth) ─────────────────────────
  #
  # Written straight to the database: no notifications, no federation, and
  # each keeps its original date. The writer's own comments are theirs on
  # Inkwell; everyone else appears under their LJ name with a link back to
  # their journal (the "outside author" shape fediverse replies use), and
  # anonymous ones as Anonymous.

  defp with_comments(entry, entry_map, import_record) do
    entry = put_origin(entry, entry_map, import_record)
    import_comments(entry, entry_map[:comments] || [], import_record)
    entry
  end

  # ── Where it came from ───────────────────────────────────────────────────

  @format_origins %{
    "livejournal" => "livejournal",
    "livejournal_public" => "livejournal",
    "wordpress_wxr" => "wordpress",
    "medium_html" => "medium",
    "substack" => "substack",
    "substack_csv" => "substack"
  }

  defp put_origin(entry, entry_map, import_record) do
    origin = entry_map[:origin] || Map.get(@format_origins, import_record.format)
    url = entry_map[:source_id]
    url = if is_binary(url) and String.starts_with?(url, "https://") and byte_size(url) <= 500, do: url
    mark = (import_record.options || %{})["archive_mark"] == true and not is_nil(origin)

    if origin do
      attrs = %{imported_from: origin, imported_url: url}
      attrs = if mark, do: Map.put(attrs, :archive_mark, true), else: attrs

      case entry |> Inkwell.Journals.Entry.archive_changeset(attrs) |> Repo.update() do
        {:ok, updated} -> updated
        _ -> entry
      end
    else
      entry
    end
  end

  defp has_comments?(entry) do
    import Ecto.Query
    Inkwell.Journals.Comment |> where(entry_id: ^entry.id) |> Repo.exists?()
  end

  defp import_comments(_entry, [], _import_record), do: :ok

  defp import_comments(entry, comments, import_record) do
    owner = normalize_lj_name((import_record.options || %{})["lj_username"])

    Enum.reduce(comments, %{}, fn c, ids ->
      attrs =
        %{
          "entry_id" => entry.id,
          "body_html" => c.body_html,
          "url" => c[:url],
          "parent_comment_id" => c.parent_source_id && Map.get(ids, c.parent_source_id)
        }
        |> Map.merge(comment_author(c, owner, entry.user_id, import_record))
        |> Enum.reject(fn {_k, v} -> is_nil(v) end)
        |> Map.new()

      case Journals.create_comment(attrs) do
        {:ok, comment} ->
          if c.posted_at do
            import Ecto.Query
            at = DateTime.truncate(c.posted_at, :microsecond) |> then(&%{&1 | microsecond: {elem(&1.microsecond, 0), 6}})
            Inkwell.Journals.Comment |> where(id: ^comment.id) |> Repo.update_all(set: [inserted_at: at, updated_at: at])
          end

          Process.put(:imported_comments, Process.get(:imported_comments, 0) + 1)
          Map.put(ids, c.source_id, comment.id)

        {:error, _} ->
          ids
      end
    end)

    :ok
  end

  defp comment_author(c, owner, entry_user_id, import_record) do
    site = if import_record.format == "livejournal" and dreamwidth?(c), do: :dreamwidth, else: :livejournal
    name = c.author

    cond do
      owner && name && normalize_lj_name(name) == owner ->
        %{"user_id" => entry_user_id}

      name ->
        {domain, host} =
          case site do
            :dreamwidth -> {"dreamwidth.org", "#{String.replace(name, "_", "-")}.dreamwidth.org"}
            _ -> {"livejournal.com", "#{String.replace(name, "_", "-")}.livejournal.com"}
          end

        %{
          "remote_author" => %{
            "username" => name,
            "display_name" => name,
            "domain" => domain,
            "profile_url" => "https://#{host}/",
            "source" => Atom.to_string(site)
          }
        }

      true ->
        %{"remote_author" => %{"display_name" => "Anonymous", "source" => Atom.to_string(site)}}
    end
  end

  defp dreamwidth?(c), do: Map.get(c, :site) == :dreamwidth

  defp normalize_lj_name(nil), do: nil
  defp normalize_lj_name(name), do: name |> String.downcase() |> String.replace("-", "_")

  defp get_parser("inkwell_json"), do: Inkwell.Import.Parsers.InkwellJson
  defp get_parser("generic_csv"), do: Inkwell.Import.Parsers.GenericCsv
  defp get_parser("generic_json"), do: Inkwell.Import.Parsers.GenericJson
  defp get_parser("wordpress_wxr"), do: Inkwell.Import.Parsers.WordpressWxr
  defp get_parser("medium_html"), do: Inkwell.Import.Parsers.MediumHtml
  defp get_parser("substack_csv"), do: Inkwell.Import.Parsers.SubstackCsv
  defp get_parser("substack"), do: Inkwell.Import.Parsers.Substack
  defp get_parser("livejournal"), do: Inkwell.Import.Parsers.Livejournal
  defp get_parser("livejournal_public"), do: Inkwell.Import.Parsers.LivejournalPublic
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
