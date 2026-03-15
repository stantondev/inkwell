defmodule Inkwell.Import.Parsers.GenericJsonTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.GenericJson

  describe "parse/1 with array format" do
    test "parses JSON array of entries" do
      json =
        Jason.encode!([
          %{"title" => "Post 1", "body" => "Body 1", "date" => "2025-06-15"},
          %{"title" => "Post 2", "content" => "Body 2", "created_at" => "2025-07-01"}
        ])

      {:ok, entries} = GenericJson.parse(json)
      assert length(entries) == 2
      assert hd(entries).title == "Post 1"
      assert hd(entries).body_html =~ "Body 1"
    end
  end

  describe "parse/1 with wrapper object" do
    test "parses entries key" do
      json = Jason.encode!(%{"entries" => [%{"title" => "Entry", "body" => "Content"}]})
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.title == "Entry"
    end

    test "parses posts key" do
      json = Jason.encode!(%{"posts" => [%{"title" => "Post", "body" => "Content"}]})
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.title == "Post"
    end

    test "parses articles key" do
      json = Jason.encode!(%{"articles" => [%{"title" => "Article", "body" => "Content"}]})
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.title == "Article"
    end

    test "parses items key" do
      json = Jason.encode!(%{"items" => [%{"title" => "Item", "body" => "Content"}]})
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.title == "Item"
    end
  end

  describe "field mapping" do
    test "supports body_html field" do
      json = Jason.encode!([%{"title" => "T", "body_html" => "<p>HTML body</p>"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.body_html == "<p>HTML body</p>"
    end

    test "supports content field" do
      json = Jason.encode!([%{"title" => "T", "content" => "Content text"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.body_html =~ "Content text"
    end

    test "wraps plain text in HTML tags" do
      json = Jason.encode!([%{"title" => "T", "body" => "Plain text"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.body_html == "<p>Plain text</p>"
    end

    test "supports name as title, description as body" do
      json = Jason.encode!([%{"name" => "Alt Title", "description" => "Alt body"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.title == "Alt Title"
      assert entry.body_html =~ "Alt body"
    end

    test "parses tags as array" do
      json = Jason.encode!([%{"title" => "T", "body" => "B", "tags" => ["a", "b", "c"]}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.tags == ["a", "b", "c"]
    end

    test "parses tags as comma-separated string" do
      json = Jason.encode!([%{"title" => "T", "body" => "B", "tags" => "a, b, c"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert "a" in entry.tags
      assert "b" in entry.tags
      assert "c" in entry.tags
    end

    test "supports categories and labels as tag sources" do
      json = Jason.encode!([%{"title" => "T", "body" => "B", "categories" => ["cat1"]}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.tags == ["cat1"]
    end

    test "supports mood and music fields" do
      json = Jason.encode!([%{"title" => "T", "body" => "B", "mood" => "happy", "music" => "song.mp3"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.mood == "happy"
      assert entry.music == "song.mp3"
    end

    test "detects draft from status field" do
      json = Jason.encode!([%{"title" => "T", "body" => "B", "status" => "draft"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.was_draft == true
    end

    test "detects draft from is_published=false" do
      json = Jason.encode!([%{"title" => "T", "body" => "B", "is_published" => false}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.was_draft == true
    end

    test "parses various date field names" do
      json = Jason.encode!([%{"title" => "T", "body" => "B", "published_at" => "2025-06-15"}])
      {:ok, [entry]} = GenericJson.parse(json)
      assert entry.published_at.year == 2025
    end
  end

  test "returns error for invalid JSON" do
    assert {:error, msg} = GenericJson.parse("not json {{{")
    assert msg =~ "Invalid JSON"
  end

  test "returns error for non-array/object JSON" do
    assert {:error, _} = GenericJson.parse(~s("just a string"))
  end

  test "filters out non-map items from array" do
    json = Jason.encode!([%{"title" => "Valid"}, "not a map", 42])
    {:ok, entries} = GenericJson.parse(json)
    assert length(entries) == 1
  end
end
