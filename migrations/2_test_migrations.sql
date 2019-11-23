create table Foo(
uid nvarchar,
location nvarchar
);

insert into Foo (uid, location) values ('testuid', 'testlocation');

alter table Foo rename to FooOld;

create table Foo(
uid
);

insert into Foo select uid from FooOld;

drop table FooOld;
