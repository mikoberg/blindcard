# Todo

## Official fight videos on the classics (needs you, about 5 minutes)

The Watch button links to the official video of a fight on the UFC YouTube channel. The code is
done and committed; what is missing is a YouTube API key, so no fight has a video yet.

1. Open console.cloud.google.com and create a project.
2. Enable the **YouTube Data API v3** ("Enable APIs and services").
3. Under "Credentials", create an **API key** and restrict it to the YouTube Data API v3.
4. Put it in `ingest/.env` yourself: `YOUTUBE_API_KEY=<your key>` (the file is git-ignored; do not
   paste the key in chat).
5. Tell Claude. It then runs `ingest-videos --dry-run` first (how many of the 110 classics get an
   unambiguous video, which are ambiguous or missing, nothing written), then the real run.

Notes:
- Costs about 400 of the 10,000 free quota units per day.
- Not every classic is on the UFC channel (many old and Fight Pass fights are not): those get no
  button. Expect roughly 40% to 70% to be linked.
- Only the opaque video id is stored, never a title (titles give away the result).
