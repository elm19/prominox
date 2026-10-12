"""Emergency reset for the built-in admin (the admin can't ask another admin for a new password).

Run from back-end/:
    python -m scripts.reset_admin_password
Prints a new one-time password; the admin must change it at the next sign-in.
"""
import sys

from app.crud.user import reset_password
from app.database import SessionLocal
from app.models.user import ROLE_ADMIN, UserDB

def main() -> int:
    with SessionLocal() as db:
        admin = db.query(UserDB).filter(UserDB.role == ROLE_ADMIN).order_by(UserDB.id).first()
        if admin is None:
            print("No admin exists yet: start the API once and it will create one.")
            return 1
        password = reset_password(db, admin)
        db.commit()
        print(f"Username: {admin.username}\nTemporary password: {password}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
