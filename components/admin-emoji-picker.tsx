"use client";
import EmojiPicker from "emoji-picker-react";
import russianEmojis from "emoji-picker-react/data/emojis-ru";

export default function AdminEmojiPicker({onSelect}:{onSelect:(emoji:string)=>void}){
  return <div className="admin-emoji-full-picker">
    <EmojiPicker
      emojiData={russianEmojis}
      colorScheme="light"
      emojiStyle="native"
      width="100%"
      height={365}
      labels={{
        searchLabel:"Поиск эмодзи",
        searchPlaceholder:"Найти эмодзи: кошка, сердце, техника…"
      }}
      previewConfig={{showPreview:false}}
      onEmojiClick={emoji=>onSelect(emoji.emoji)}
    />
  </div>;
}
