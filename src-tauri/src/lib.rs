// Tauri 库入口。纯前端应用，不注册任何命令，窗口只加载本地静态资源。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
