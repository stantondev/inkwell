defmodule Inkwell.Import.Parsers.InkwellJsonTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.InkwellJson

  describe "parse/1 with standard Inkwell format" do
    test "parses entries from entries key" do
      json =
        Jason.encode!(%{
          "entries" => [
            %{
              "title" => "My Entry",
              "body_html" => "<p>Hello world</p>",
              "mood" => "happy",
              "music" => "https://spotify.com/track/123",
              "tags" => ["journal", "life"],
              "published_at" => "2025-06-15T10:00:00Z"
            }
          ]
        })

      {:ok, [entry]} = InkwellJson.parse(json)
      assert entry.title == "My Entry"
      assert entry.body_html == "<p>Hello world</p>"
      assert entry.mood == "happy"
      assert entry.music == "https://spotify.com/track/123"
      assert entry.tags == ["journal", "life"]
      assert entry.published_at.year == 2025
      assert entry.was_draft == false
    end

    test "separates entries and drafts" do
      json =
        Jason.encode!(%{
          "entries" => [%{"title" => "Published", "body_html" => "<p>Pub</p>"}],
          "drafts" => [%{"title" => "Draft", "body_html" => "<p>Draft</p>"}]
        })

      {:ok, entries} = InkwellJson.parse(json)
      assert length(entries) == 2

      published = Enum.find(entries, &(&1.title == "Published"))
      draft = Enum.find(entries, &(&1.title == "Draft"))

      assert published.was_draft == false
      assert draft.was_draft == true
    end

    test "handles missing drafts key" do
      json = Jason.encode!(%{"entries" => [%{"title" => "Entry", "body_html" => "<p>Content</p>"}]})
      {:ok, [entry]} = InkwellJson.parse(json)
      assert entry.was_draft == false
    end
  end

  describe "parse/1 with array format" do
    test "parses bare array as published entries" do
      json = Jason.encode!([%{"title" => "Array Entry", "body_html" => "<p>Content</p>"}])
      {:ok, [entry]} = InkwellJson.parse(json)
      assert entry.title == "Array Entry"
      assert entry.was_draft == false
    end
  end

  describe "parse/1 with gzipped data" do
    test "decompresses and parses gzipped JSON" do
      json = Jason.encode!(%{"entries" => [%{"title" => "Gzipped", "body_html" => "<p>Content</p>"}]})
      gzipped = :zlib.gzip(json)

      {:ok, [entry]} = InkwellJson.parse(gzipped)
      assert entry.title == "Gzipped"
    end
  end

  test "handles nil tags gracefully" do
    json = Jason.encode!(%{"entries" => [%{"title" => "No Tags", "body_html" => "<p>Content</p>", "tags" => nil}]})
    {:ok, [entry]} = InkwellJson.parse(json)
    assert entry.tags == []
  end

  test "converts non-string tag values to strings" do
    json = Jason.encode!(%{"entries" => [%{"title" => "T", "body_html" => "<p>B</p>", "tags" => [1, "two", 3]}]})
    {:ok, [entry]} = InkwellJson.parse(json)
    assert entry.tags == ["1", "two", "3"]
  end

  test "returns error for invalid JSON" do
    assert {:error, msg} = InkwellJson.parse("not json")
    assert msg =~ "Invalid JSON"
  end

  test "returns error for unexpected JSON structure" do
    json = Jason.encode!(%{"wrong_key" => [%{"title" => "T"}]})
    assert {:error, _} = InkwellJson.parse(json)
  end

  test "returns error for corrupt gzip" do
    assert {:error, _} = InkwellJson.parse(<<0x1F, 0x8B, 0x00, 0x00>>)
  end
end
