defmodule Inkwell.Import.Parsers.WordpressWxrTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.WordpressWxr

  @fixtures_dir Path.join([__DIR__, "..", "..", "..", "fixtures", "import"])

  defp fixture(name), do: File.read!(Path.join(@fixtures_dir, name))

  describe "parse/1 with sample WXR file" do
    setup do
      {:ok, entries} = WordpressWxr.parse(fixture("wordpress_sample.xml"))
      %{entries: entries}
    end

    test "parses only post items, skipping pages and attachments", %{entries: entries} do
      # Should have: "My First Post", "Draft Post", "Post With Shortcodes", "Post With Images"
      # Should NOT have: "About Page" (page), "Attachment Item" (attachment)
      assert length(entries) == 4
      titles = Enum.map(entries, & &1.title)
      assert "My First Post" in titles
      assert "Draft Post" in titles
      assert "Post With Shortcodes" in titles
      assert "Post With Images" in titles
      refute "About Page" in titles
      refute "Attachment Item" in titles
    end

    test "extracts title correctly", %{entries: entries} do
      first = Enum.find(entries, &(&1.title == "My First Post"))
      assert first.title == "My First Post"
    end

    test "extracts body HTML from CDATA", %{entries: entries} do
      first = Enum.find(entries, &(&1.title == "My First Post"))
      assert first.body_html =~ "Hello world!"
      assert first.body_html =~ "<p>"
    end

    test "prefers GMT date when available", %{entries: entries} do
      first = Enum.find(entries, &(&1.title == "My First Post"))
      # Should use post_date_gmt (14:30) over post_date (10:30)
      assert first.published_at.hour == 14
    end

    test "extracts tags/categories", %{entries: entries} do
      first = Enum.find(entries, &(&1.title == "My First Post"))
      assert "Technology" in first.tags
      assert "Programming" in first.tags
    end

    test "detects draft status", %{entries: entries} do
      draft = Enum.find(entries, &(&1.title == "Draft Post"))
      assert draft.was_draft == true

      published = Enum.find(entries, &(&1.title == "My First Post"))
      assert published.was_draft == false
    end

    test "strips shortcodes", %{entries: entries} do
      shortcode_post = Enum.find(entries, &(&1.title == "Post With Shortcodes"))
      refute shortcode_post.body_html =~ "[gallery"
      refute shortcode_post.body_html =~ "[caption"
      refute shortcode_post.body_html =~ "[/caption]"
      assert shortcode_post.body_html =~ "Before shortcode."
      assert shortcode_post.body_html =~ "After shortcode."
    end

    test "preserves image tags in body", %{entries: entries} do
      image_post = Enum.find(entries, &(&1.title == "Post With Images"))
      assert image_post.body_html =~ "<img"
      assert image_post.body_html =~ "https://example.com/photo.jpg"
    end

    test "strips WordPress block editor comments", %{entries: entries} do
      image_post = Enum.find(entries, &(&1.title == "Post With Images"))
      refute image_post.body_html =~ "<!-- wp:image"
      refute image_post.body_html =~ "<!-- /wp:image -->"
      # But preserves the content inside the comment blocks
      assert image_post.body_html =~ "wp-block-image"
    end

    test "sets mood and music to nil", %{entries: entries} do
      Enum.each(entries, fn entry ->
        assert entry.mood == nil
        assert entry.music == nil
      end)
    end
  end

  test "handles BOM-prefixed XML" do
    bom = <<0xEF, 0xBB, 0xBF>>

    xml = ~s(<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><item>
<title>BOM Test</title>
<content:encoded><![CDATA[<p>Content</p>]]></content:encoded>
<wp:post_date>2025-01-01 00:00:00</wp:post_date>
<wp:status>publish</wp:status>
<wp:post_type>post</wp:post_type>
</item></channel></rss>)

    {:ok, entries} = WordpressWxr.parse(bom <> xml)
    assert length(entries) == 1
    assert hd(entries).title == "BOM Test"
  end

  test "returns error for invalid XML" do
    assert {:error, msg} = WordpressWxr.parse("this is not xml at all")
    assert msg =~ "XML parse error"
  end

  test "returns empty list for WXR with no items" do
    xml = ~s(<?xml version="1.0"?><rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/"><channel></channel></rss>)
    {:ok, entries} = WordpressWxr.parse(xml)
    assert entries == []
  end

  describe "WordPress comment stripping" do
    test "strips wp:paragraph comments" do
      xml = ~s(<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><item>
<title>Comment Test</title>
<content:encoded><![CDATA[<!-- wp:paragraph -->
<p>First paragraph.</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph -->
<p>Second paragraph.</p>
<!-- /wp:paragraph -->]]></content:encoded>
<wp:post_date>2025-01-01 00:00:00</wp:post_date>
<wp:status>publish</wp:status>
<wp:post_type>post</wp:post_type>
</item></channel></rss>)

      {:ok, [entry]} = WordpressWxr.parse(xml)
      refute entry.body_html =~ "<!-- wp:paragraph"
      refute entry.body_html =~ "<!-- /wp:paragraph"
      assert entry.body_html =~ "First paragraph"
      assert entry.body_html =~ "Second paragraph"
    end

    test "strips wp:heading and wp:image comments with attributes" do
      xml = ~s(<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><item>
<title>Block Comments</title>
<content:encoded><![CDATA[<!-- wp:heading {"level":2} -->
<h2>A Heading</h2>
<!-- /wp:heading -->
<!-- wp:image {"id":456,"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="photo.jpg" alt=""/></figure>
<!-- /wp:image -->]]></content:encoded>
<wp:post_date>2025-01-01 00:00:00</wp:post_date>
<wp:status>publish</wp:status>
<wp:post_type>post</wp:post_type>
</item></channel></rss>)

      {:ok, [entry]} = WordpressWxr.parse(xml)
      refute entry.body_html =~ "<!--"
      refute entry.body_html =~ "-->"
      assert entry.body_html =~ "<h2>A Heading</h2>"
      assert entry.body_html =~ "<img src=\"photo.jpg\""
    end

    test "does not collapse excessive whitespace from comment removal" do
      xml = ~s(<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><item>
<title>Whitespace</title>
<content:encoded><![CDATA[<!-- wp:paragraph -->
<p>Para 1.</p>
<!-- /wp:paragraph -->


<!-- wp:paragraph -->
<p>Para 2.</p>
<!-- /wp:paragraph -->]]></content:encoded>
<wp:post_date>2025-01-01 00:00:00</wp:post_date>
<wp:status>publish</wp:status>
<wp:post_type>post</wp:post_type>
</item></channel></rss>)

      {:ok, [entry]} = WordpressWxr.parse(xml)
      # Should not have more than 2 consecutive newlines
      refute entry.body_html =~ "\n\n\n"
    end
  end
end
