// 桌面端入口：直接加载打包好的前端，无后端逻辑、无网络请求。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    word_memory_lib::run()
}
