defmodule Inkwell.Import.Parser do
  @moduledoc """
  Behaviour for import format parsers. Each parser takes raw file data
  and returns a list of normalized entry maps.
  """

  @type entry_map :: %{
          optional(:title) => String.t() | nil,
          optional(:body_html) => String.t() | nil,
          optional(:mood) => String.t() | nil,
          optional(:music) => String.t() | nil,
          optional(:tags) => [String.t()],
          optional(:published_at) => DateTime.t() | nil,
          optional(:was_draft) => boolean()
        }

  @callback parse(binary()) :: {:ok, [entry_map()]} | {:error, String.t()}

  @doc """
  Parse a datetime string into a DateTime. Tries ISO 8601 first,
  then common formats like "YYYY-MM-DD HH:MM:SS".
  """
  def parse_datetime(nil), do: nil
  def parse_datetime(""), do: nil

  def parse_datetime(str) when is_binary(str) do
    str = String.trim(str)

    case DateTime.from_iso8601(str) do
      {:ok, dt, _offset} ->
        dt

      {:error, _} ->
        # Try NaiveDateTime (e.g., "2025-01-15 10:30:00")
        case NaiveDateTime.from_iso8601(str) do
          {:ok, ndt} ->
            DateTime.from_naive!(ndt, "Etc/UTC")

          {:error, _} ->
            # Try "YYYY-MM-DD HH:MM:SS" format (WordPress)
            case Regex.run(~r/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/, str) do
              [_, y, m, d, h, min, s] ->
                case NaiveDateTime.new(
                       String.to_integer(y),
                       String.to_integer(m),
                       String.to_integer(d),
                       String.to_integer(h),
                       String.to_integer(min),
                       String.to_integer(s)
                     ) do
                  {:ok, ndt} -> DateTime.from_naive!(ndt, "Etc/UTC")
                  _ -> nil
                end

              _ ->
                # Try date-only "YYYY-MM-DD"
                case Date.from_iso8601(str) do
                  {:ok, date} ->
                    DateTime.new!(date, ~T[00:00:00], "Etc/UTC")

                  _ ->
                    nil
                end
            end
        end
    end
  end

  def parse_datetime(_), do: nil

  @doc """
  Detect if a string contains HTML tags. If not, wrap in <p> tags.
  """
  def ensure_html(nil), do: nil
  def ensure_html(""), do: nil

  def ensure_html(text) do
    if Regex.match?(~r/<[a-z][\s\S]*>/i, text) do
      text
    else
      text
      |> String.split(~r/\n{2,}/)
      |> Enum.map(fn para ->
        trimmed = String.trim(para)
        if trimmed == "", do: "", else: "<p>#{trimmed}</p>"
      end)
      |> Enum.reject(&(&1 == ""))
      |> Enum.join("\n")
    end
  end
end
