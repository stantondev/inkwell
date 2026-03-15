defmodule Inkwell.Import.Parsers.MediumHtmlTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.MediumHtml

  @fixtures_dir Path.join([__DIR__, "..", "..", "..", "fixtures", "import"])

  defp fixture(name), do: File.read!(Path.join(@fixtures_dir, name))

  describe "parse/1 with single HTML file" do
    test "extracts title from h1" do
      {:ok, [entry]} = MediumHtml.parse(fixture("medium_post.html"))
      assert entry.title == "A Medium Story"
    end

    test "extracts body from e-content section" do
      {:ok, [entry]} = MediumHtml.parse(fixture("medium_post.html"))
      assert entry.body_html =~ "body of my Medium article"
      assert entry.body_html =~ "rich content and formatting"
    end

    test "removes title from body to avoid duplication" do
      {:ok, [entry]} = MediumHtml.parse(fixture("medium_post.html"))
      # The h1 title should be stripped from body
      refute entry.body_html =~ "<h1"
    end

    test "extracts datetime from time element" do
      {:ok, [entry]} = MediumHtml.parse(fixture("medium_post.html"))
      assert entry.published_at.year == 2025
      assert entry.published_at.month == 3
      assert entry.published_at.day == 20
    end

    test "extracts tags from p-category links" do
      {:ok, [entry]} = MediumHtml.parse(fixture("medium_post.html"))
      assert "Writing" in entry.tags
      assert "Blogging" in entry.tags
      # Should not include non-category links
      refute "About" in entry.tags
    end

    test "removes footer from body" do
      {:ok, [entry]} = MediumHtml.parse(fixture("medium_post.html"))
      refute entry.body_html =~ "p-category"
    end
  end

  test "detects draft status from filename" do
    html = ~s(<!DOCTYPE html><html><body>
      <h1>My Draft</h1>
      <section class="e-content"><p>Draft content</p></section>
    </body></html>)

    # Simulate what would happen with a draft filename
    # The parse function uses "uploaded.html" for single files,
    # but in ZIP the filename would contain "draft"
    {:ok, [entry]} = MediumHtml.parse(html)
    # Single file upload always uses "uploaded.html" filename
    assert entry.was_draft == false
  end

  test "returns empty list for HTML with no content" do
    {:ok, entries} = MediumHtml.parse("<html><body></body></html>")
    assert entries == []
  end

  test "handles HTML without e-content section" do
    html = ~s(<!DOCTYPE html><html><body>
      <article>
        <h1>Fallback Article</h1>
        <p>Content inside article tag.</p>
      </article>
    </body></html>)

    {:ok, [entry]} = MediumHtml.parse(html)
    assert entry.title == "Fallback Article"
    assert entry.body_html =~ "Content inside article tag"
  end

  test "extracts title from h3 with p-name class" do
    html = ~s(<!DOCTYPE html><html><body>
      <h3 class="graf graf--h3 p-name">H3 Title</h3>
      <section class="e-content"><p>Body text</p></section>
    </body></html>)

    {:ok, [entry]} = MediumHtml.parse(html)
    assert entry.title == "H3 Title"
  end
end
