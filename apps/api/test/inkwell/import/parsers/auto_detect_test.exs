defmodule Inkwell.Import.Parsers.AutoDetectTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.AutoDetect

  @fixtures_dir Path.join([__DIR__, "..", "..", "..", "fixtures", "import"])

  defp fixture(name), do: File.read!(Path.join(@fixtures_dir, name))

  describe "XML detection" do
    test "routes XML to WordPress parser" do
      {:ok, entries} = AutoDetect.parse(fixture("wordpress_sample.xml"))
      assert length(entries) > 0
      assert hd(entries).title == "My First Post"
    end

    test "detects XML from <?xml declaration" do
      xml = ~s(<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><item>
<title>Auto</title>
<content:encoded><![CDATA[<p>Content</p>]]></content:encoded>
<wp:post_date>2025-01-01 00:00:00</wp:post_date>
<wp:status>publish</wp:status>
<wp:post_type>post</wp:post_type>
</item></channel></rss>)

      {:ok, [entry]} = AutoDetect.parse(xml)
      assert entry.title == "Auto"
    end
  end

  describe "JSON detection" do
    test "routes Inkwell JSON (entries key) to InkwellJson parser" do
      json = Jason.encode!(%{"entries" => [%{"title" => "Inkwell Entry", "body_html" => "<p>Content</p>"}]})
      {:ok, [entry]} = AutoDetect.parse(json)
      assert entry.title == "Inkwell Entry"
    end

    test "routes Inkwell JSON with drafts to InkwellJson parser" do
      json = Jason.encode!(%{
        "entries" => [%{"title" => "Pub", "body_html" => "<p>P</p>"}],
        "drafts" => [%{"title" => "Draft", "body_html" => "<p>D</p>"}]
      })
      {:ok, entries} = AutoDetect.parse(json)
      assert length(entries) == 2
    end

    test "routes generic JSON array to GenericJson parser" do
      json = Jason.encode!([%{"title" => "Generic", "content" => "Content"}])
      {:ok, [entry]} = AutoDetect.parse(json)
      assert entry.title == "Generic"
    end

    test "routes JSON array with body_html to InkwellJson parser" do
      json = Jason.encode!([%{"title" => "T", "body_html" => "<p>B</p>"}])
      {:ok, [entry]} = AutoDetect.parse(json)
      assert entry.title == "T"
    end

    test "routes generic JSON object to GenericJson parser" do
      json = Jason.encode!(%{"posts" => [%{"title" => "Post", "body" => "Content"}]})
      {:ok, [entry]} = AutoDetect.parse(json)
      assert entry.title == "Post"
    end
  end

  describe "HTML detection" do
    test "routes Medium HTML to MediumHtml parser" do
      {:ok, entries} = AutoDetect.parse(fixture("medium_post.html"))
      assert length(entries) == 1
      assert hd(entries).title == "A Medium Story"
    end

    test "routes generic HTML (no Medium markers) to Substack parser" do
      {:ok, entries} = AutoDetect.parse(fixture("substack_fragment.html"))
      assert length(entries) >= 1
    end
  end

  describe "CSV detection" do
    test "routes Substack CSV to Substack parser" do
      csv = "title,subtitle,post_date,body_html,is_published\nTest,Sub,2025-01-01,<p>Body</p>,true\n"
      {:ok, [entry]} = AutoDetect.parse(csv)
      assert entry.title == "Test"
    end

    test "routes generic CSV to GenericCsv parser" do
      csv = "title,body,date,tags\nPost,Content,2025-01-01,\"a,b\"\n"
      {:ok, [entry]} = AutoDetect.parse(csv)
      assert entry.title == "Post"
    end
  end

  describe "gzip handling" do
    test "decompresses gzip before detection" do
      json = Jason.encode!(%{"entries" => [%{"title" => "Gzipped", "body_html" => "<p>C</p>"}]})
      gzipped = :zlib.gzip(json)

      {:ok, [entry]} = AutoDetect.parse(gzipped)
      assert entry.title == "Gzipped"
    end
  end

  test "returns error for unrecognizable format" do
    assert {:error, msg} = AutoDetect.parse("random binary garbage 12345")
    assert msg =~ "Unable to detect file format"
  end
end
