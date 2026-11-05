package com.brocode.gamingzone;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

/**
 * Thin native shell around the Bro Code Gaming Zone website.
 *
 * The site itself is untouched, so booking, pricing, offers, tournaments and the
 * payment page always match whatever is deployed. This class only adds the parts
 * a browser tab cannot give: an app icon, a splash colour, pull to refresh, a
 * friendly offline screen and handing UPI / WhatsApp / dialler links to the
 * right app on the phone.
 */
public class MainActivity extends Activity {

  private static final String SITE_HOST = "brocode-gaming-zone.onrender.com";
  private static final String SITE_URL = "https://" + SITE_HOST + "/";
  private static final String OFFLINE_URL = "file:///android_asset/offline.html";

  private static final int PAGE_BG = 0xFF07070A;
  private static final int BRAND_RED = 0xFFFF1F3D;

  private WebView web;
  private ProgressBar loader;
  private float touchStartY;
  private boolean pullCandidate;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle saved) {
    super.onCreate(saved);

    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(PAGE_BG);

    web = new WebView(this);
    web.setBackgroundColor(PAGE_BG);
    root.addView(web, new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    loader = new ProgressBar(this);
    loader.setIndeterminate(true);
    loader.setIndeterminateTintList(ColorStateList.valueOf(BRAND_RED));

    FrameLayout.LayoutParams loaderParams = new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    loaderParams.gravity = Gravity.CENTER;
    root.addView(loader, loaderParams);

    setContentView(root);

    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(true);
    settings.setSupportZoom(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setMediaPlaybackRequiresUserGesture(true);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setUserAgentString(settings.getUserAgentString() + " BroCodeApp/1.0");

    web.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return route(request.getUrl());
      }

      @Override
      public void onPageStarted(WebView view, String url, Bitmap favicon) {
        loader.setVisibility(View.VISIBLE);
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        loader.setVisibility(View.GONE);
      }

      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (!request.isForMainFrame()) return;
        loader.setVisibility(View.GONE);
        showOfflineScreen();
      }
    });

    // Pull down from the very top to refresh — WebView has no built-in gesture.
    web.setOnTouchListener(new View.OnTouchListener() {
      @Override
      public boolean onTouch(View view, MotionEvent event) {
        final int threshold = (int) (90 * getResources().getDisplayMetrics().density);

        switch (event.getActionMasked()) {
          case MotionEvent.ACTION_DOWN:
            pullCandidate = web.getScrollY() == 0;
            touchStartY = event.getY();
            break;
          case MotionEvent.ACTION_MOVE:
            if (pullCandidate && event.getY() - touchStartY > threshold) {
              pullCandidate = false;
              reloadPage();
            }
            break;
          default:
            pullCandidate = false;
        }

        return false;
      }
    });

    if (saved != null) {
      web.restoreState(saved);
    } else {
      web.loadUrl(SITE_URL);
    }
  }

  /**
   * Keep our own pages inside the app; hand everything else (UPI, WhatsApp, the
   * dialler, maps, mail) to whichever app on the phone can handle it.
   */
  private boolean route(Uri uri) {
    if (uri == null) return false;

    String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
    String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

    if (scheme.equals("http") || scheme.equals("https")) {
      if (host.equals(SITE_HOST)) return false;
      openExternally(uri);
      return true;
    }

    if (scheme.isEmpty() || scheme.equals("file") || scheme.equals("about")
        || scheme.equals("javascript") || scheme.equals("data") || scheme.equals("blob")) {
      return false;
    }

    openExternally(uri);
    return true;
  }

  private void openExternally(Uri uri) {
    Intent intent;

    if ("intent".equalsIgnoreCase(uri.getScheme())) {
      try {
        intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
      } catch (Exception error) {
        toast("Could not open that link.");
        return;
      }
    } else {
      intent = new Intent(Intent.ACTION_VIEW, uri);
    }

    try {
      startActivity(intent);
    } catch (ActivityNotFoundException error) {
      toast("No app on this phone can open that link.");
    } catch (Exception error) {
      toast("Could not open that link.");
    }
  }

  private void showOfflineScreen() {
    String current = web.getUrl();
    if (current != null && current.startsWith("file:///android_asset/")) return;
    web.loadUrl(OFFLINE_URL);
  }

  private void reloadPage() {
    String current = web.getUrl();
    if (current == null || current.startsWith("file://")) {
      web.loadUrl(SITE_URL);
      return;
    }
    web.reload();
  }

  private void toast(String message) {
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
  }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
    if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
      web.goBack();
      return true;
    }
    return super.onKeyDown(keyCode, event);
  }

  @Override
  protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    web.saveState(outState);
  }
}
