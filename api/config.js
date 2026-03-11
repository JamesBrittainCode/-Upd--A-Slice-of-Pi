module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  const allowedEmailDomain = process.env.ALLOWED_EMAIL_DOMAIN || "";

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      supabaseUrl,
      supabaseAnonKey,
      allowedEmailDomain,
    })
  );
};

