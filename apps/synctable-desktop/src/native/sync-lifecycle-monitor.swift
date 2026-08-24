import AppKit

let notificationCenter = NSWorkspace.shared.notificationCenter

func emit(_ state: String) {
  print(state)
  fflush(stdout)
}

notificationCenter.addObserver(
  forName: NSWorkspace.willSleepNotification,
  object: nil,
  queue: .main
) { _ in emit("paused") }

notificationCenter.addObserver(
  forName: NSWorkspace.sessionDidResignActiveNotification,
  object: nil,
  queue: .main
) { _ in emit("paused") }

notificationCenter.addObserver(
  forName: NSWorkspace.didWakeNotification,
  object: nil,
  queue: .main
) { _ in emit("resumed") }

notificationCenter.addObserver(
  forName: NSWorkspace.sessionDidBecomeActiveNotification,
  object: nil,
  queue: .main
) { _ in emit("resumed") }

RunLoop.main.run()
