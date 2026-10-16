-- migration: announcement_setting  (ข้อ 2 ประกาศหน้าร้าน)
insert into public.settings (key, value)
values ('announcement', '{"enabled":false,"title":"","body":"","link_text":"","link_url":"","image_url":"","tone":"info"}');
