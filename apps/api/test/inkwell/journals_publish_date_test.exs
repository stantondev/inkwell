defmodule Inkwell.JournalsPublishDateTest do
  @moduledoc """
  Imported posts must keep the date they were originally written.

  Reported on the roadmap by @kltrtrgr after a WordPress migration: every post
  landed in Drafts and "could be published only as written today". Two causes,
  both here:

    * `draft_changeset` didn't cast `:published_at`, so the original date was
      dropped the instant an imported post became a draft — even though the
      import worker passes it in `build_entry_attrs/3`.
    * `publish_changeset` did `put_change(:published_at, DateTime.utc_now())`
      unconditionally, so even a preserved date was overwritten at publish.

  226 of that user's posts are still sitting in drafts.
  """
  use Inkwell.DataCase, async: true

  alias Inkwell.Journals
  alias Inkwell.Journals.Entry

  defp draft_attrs(user, extra \\ %{}) do
    Map.merge(
      %{
        "user_id" => user.id,
        "title" => "An old post",
        "body_html" => "<p>Written years ago.</p>",
        "privacy" => "public"
      },
      extra
    )
  end

  describe "draft_changeset" do
    test "keeps an imported post's original date" do
      user = create_user()
      original = ~U[2019-04-02 11:30:00.000000Z]

      {:ok, draft} =
        Journals.create_draft(draft_attrs(user, %{"published_at" => original}))

      assert draft.status == :draft
      assert DateTime.compare(draft.published_at, original) == :eq
    end

    test "a normal draft with no date is left alone" do
      user = create_user()
      {:ok, draft} = Journals.create_draft(draft_attrs(user))
      assert is_nil(draft.published_at)
    end
  end

  describe "publishing" do
    test "preserves the draft's original date instead of stamping today" do
      user = create_user()
      original = ~U[2019-04-02 11:30:00.000000Z]

      {:ok, draft} = Journals.create_draft(draft_attrs(user, %{"published_at" => original}))
      {:ok, published} = Journals.publish_draft(draft, %{})

      assert published.status == :published

      assert DateTime.compare(published.published_at, original) == :eq,
             "publishing must not overwrite an imported post's original date"
    end

    test "an explicit backdate at publish time wins" do
      user = create_user()
      backdated = ~U[2021-12-25 09:00:00.000000Z]

      {:ok, draft} = Journals.create_draft(draft_attrs(user))
      {:ok, published} = Journals.publish_draft(draft, %{"published_at" => backdated})

      assert DateTime.compare(published.published_at, backdated) == :eq
    end

    test "a draft with no date still publishes as now" do
      user = create_user()
      before = DateTime.utc_now()

      {:ok, draft} = Journals.create_draft(draft_attrs(user))
      {:ok, published} = Journals.publish_draft(draft, %{})

      assert DateTime.compare(published.published_at, before) in [:gt, :eq]
      assert DateTime.compare(published.published_at, DateTime.utc_now()) in [:lt, :eq]
    end
  end

  describe "future dates" do
    test "are rejected on publish — scheduling is not implemented" do
      user = create_user()
      future = DateTime.add(DateTime.utc_now(), 7, :day)

      {:ok, draft} = Journals.create_draft(draft_attrs(user))

      assert {:error, changeset} = Journals.publish_draft(draft, %{"published_at" => future})
      assert %{published_at: ["cannot be in the future"]} = errors_on(changeset)
    end

    test "are rejected on the draft itself" do
      user = create_user()
      future = DateTime.add(DateTime.utc_now(), 7, :day)

      assert {:error, changeset} =
               Journals.create_draft(draft_attrs(user, %{"published_at" => future}))

      assert %{published_at: ["cannot be in the future"]} = errors_on(changeset)
    end

    test "small clock skew is tolerated" do
      user = create_user()
      skewed = DateTime.add(DateTime.utc_now(), 60, :second)

      assert {:ok, %Entry{}} =
               Journals.create_draft(draft_attrs(user, %{"published_at" => skewed}))
    end
  end
end
