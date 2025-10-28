create table users (
	id serial primary key,
	email varchar(255) not null unique,
	password varchar(64) not null,
	created_at timestamp default current_timestamp
);

create table assets (
	id serial primary key,
	file_path varchar(255) not null,
	name varchar(128) default 'Unknown',
	description text null,
	user_id int references users(id) on delete cascade on update cascade
);

alter table assets add column resource_path varchar(16) not null;
