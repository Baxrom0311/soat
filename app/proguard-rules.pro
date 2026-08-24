# OkHttp/Okio ship their own consumer rules via the AAR; these are extra safety nets
# for the R8 warnings they're known to trigger on some versions.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Our own network model classes are populated via manual org.json parsing
# (no reflection), so nothing here needs an explicit -keep.
