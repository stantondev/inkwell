defmodule Inkwell.EntryPage do
  @moduledoc """
  How a writer's entry pages look to readers: the first letter (its design
  and ink), the paper, and how the page ends. Kept in
  `users.settings["entry_page"]` and returned with every full entry.

  The Illuminated initial is a Plus extra. It is saved for anyone, like the
  Plus avatar frames, but shown only while the writer has Plus; otherwise
  the page falls back to the Classic initial. `illumination` is the motif
  drawn around an Illuminated letter (vines, night sky, garden, quill).

  `text_ink` is the colour of the writing itself (Plus, same rule as
  Illuminated): "page" keeps the page's own text colour.
  """

  @initials ~w(classic illuminated blackletter inkblot none)
  @plus_initials ~w(illuminated)
  @inks ~w(blue accent black red gold)
  @papers ~w(cream notebook parchment kraft)
  @endings ~w(inkdrop fleuron quill rule none)
  @illuminations ~w(vine stars garden quill)
  @text_inks ~w(page blueblack irongall sepia green oxblood violet)

  @defaults %{
    "initial" => "classic",
    "ink" => "blue",
    "paper" => "cream",
    "ending" => "inkdrop",
    "signature" => true,
    "illumination" => "vine",
    "text_ink" => "page"
  }

  def defaults, do: @defaults

  @doc "Keeps only known keys with known values. Anything else is dropped."
  def clean(page) when is_map(page) do
    %{}
    |> pick(page, "initial", @initials)
    |> pick(page, "ink", @inks)
    |> pick(page, "paper", @papers)
    |> pick(page, "ending", @endings)
    |> pick(page, "illumination", @illuminations)
    |> pick(page, "text_ink", @text_inks)
    |> then(fn acc ->
      case page["signature"] do
        flag when is_boolean(flag) -> Map.put(acc, "signature", flag)
        _ -> acc
      end
    end)
  end

  def clean(_), do: %{}

  @doc "The style a reader sees on this writer's entries, defaults filled in."
  def for_author(%{settings: settings} = user) do
    page = Map.merge(@defaults, clean((settings || %{})["entry_page"]))

    if Inkwell.SelfHosted.effective_tier(user) == "plus" do
      page
    else
      page
      |> then(&if(&1["initial"] in @plus_initials, do: Map.put(&1, "initial", "classic"), else: &1))
      |> Map.put("text_ink", "page")
    end
  end

  def for_author(_), do: @defaults

  defp pick(acc, page, key, allowed) do
    case page[key] do
      value when is_binary(value) -> if value in allowed, do: Map.put(acc, key, value), else: acc
      _ -> acc
    end
  end
end
