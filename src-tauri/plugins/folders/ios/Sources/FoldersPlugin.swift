import Foundation
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

struct RestoreArgs: Decodable {
  let paths: [String]
}

struct ForgetArgs: Decodable {
  let path: String
}

struct PickedFolder: Encodable {
  let path: String
  let name: String
}

struct PickResult: Encodable {
  let picked: PickedFolder?
}

struct RestoredFolder: Encodable {
  let saved: String
  let path: String?
}

struct RestoreResult: Encodable {
  let folders: [RestoredFolder]
}

/// Folders picked in Files. iOS lets the app use one only while it holds
/// access, and after a restart only through a bookmark saved when it was
/// picked: this keeps those bookmarks and reopens them.
class FoldersPlugin: Plugin, UIDocumentPickerDelegate {
  private static let bookmarksKey = "app.mentis.folderBookmarks"

  /// The pick waiting for the user.
  private var pending: Invoke?
  /// Folders open in this process, by path; holding them keeps access open.
  private var open: [String: URL] = [:]

  /// Saved bookmarks, by the path the folder had when saved.
  private var bookmarks: [String: Data] {
    get { UserDefaults.standard.dictionary(forKey: Self.bookmarksKey) as? [String: Data] ?? [:] }
    set { UserDefaults.standard.set(newValue, forKey: Self.bookmarksKey) }
  }

  @objc public func pickFolder(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard let presenter = self.manager.viewController else {
        invoke.reject("There is no window to show the folder picker in.")
        return
      }
      self.pending?.resolve(PickResult(picked: nil))
      self.pending = invoke
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
      picker.delegate = self
      picker.allowsMultipleSelection = false
      presenter.present(picker, animated: true)
    }
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let invoke = pending else { return }
    pending = nil
    guard let url = urls.first else {
      invoke.resolve(PickResult(picked: nil))
      return
    }
    guard url.startAccessingSecurityScopedResource() else {
      invoke.reject("Mentis was not given access to that folder.")
      return
    }
    do {
      let data = try url.bookmarkData(
        options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
      let path = Self.realPath(url)
      bookmarks[path] = data
      open[path] = url
      invoke.resolve(
        PickResult(picked: PickedFolder(path: path, name: FileManager.default.displayName(atPath: path))))
    } catch {
      url.stopAccessingSecurityScopedResource()
      invoke.reject("Mentis could not keep access to that folder: \(error.localizedDescription)")
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pending?.resolve(PickResult(picked: nil))
    pending = nil
  }

  /// Reopens the folders saved at these paths and says where each is now. A
  /// path with no bookmark (inside the app's own folder) needs none and is
  /// returned as it is.
  @objc public func restore(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(RestoreArgs.self)
    var saved = bookmarks
    var folders: [RestoredFolder] = []
    for path in args.paths {
      if let url = open[path] {
        folders.append(RestoredFolder(saved: path, path: Self.realPath(url)))
        continue
      }
      guard let data = saved[path] else {
        folders.append(RestoredFolder(saved: path, path: path))
        continue
      }
      var stale = false
      guard
        let url = try? URL(
          resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale),
        url.startAccessingSecurityScopedResource()
      else {
        folders.append(RestoredFolder(saved: path, path: nil))
        continue
      }
      let now = Self.realPath(url)
      if stale || now != path {
        saved.removeValue(forKey: path)
        saved[now] =
          (try? url.bookmarkData(
            options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)) ?? data
      }
      open[now] = url
      folders.append(RestoredFolder(saved: path, path: now))
    }
    bookmarks = saved
    invoke.resolve(RestoreResult(folders: folders))
  }

  @objc public func forget(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ForgetArgs.self)
    open.removeValue(forKey: args.path)?.stopAccessingSecurityScopedResource()
    bookmarks.removeValue(forKey: args.path)
    invoke.resolve()
  }

  /// The path with links resolved, as the Rust side sees it (`/private/var/…`).
  private static func realPath(_ url: URL) -> String {
    guard let resolved = realpath(url.path, nil) else { return url.path }
    defer { free(resolved) }
    return String(cString: resolved)
  }
}

@_cdecl("init_plugin_folders")
func initPlugin() -> Plugin {
  return FoldersPlugin()
}
